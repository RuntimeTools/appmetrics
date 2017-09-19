/*******************************************************************************
 * Copyright 2014, 2015 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *******************************************************************************/

#ifndef BUILDING_NODE_EXTENSION
#define BUILDING_NODE_EXTENSION
#endif

#include "node.h"
#include "nan.h"
#include "uv.h"
#include "ibmras/monitoring/AgentExtensions.h"
#include "plugins/node/prof/watchdog.h"
#if !defined(_ZOS)
#include "headlessutils.h"
#endif

#if NODE_VERSION_AT_LEAST(0, 11, 0) // > v0.11+
#include "objecttracker.hpp"
#endif

#include <string>
#include <iostream>
#include <cstring>
#include <fstream>
#include <sstream>
#include <cstdlib>

#if defined(_WINDOWS)
#include <windows.h>
#else
#include <dlfcn.h>
#endif

#if defined(_ZOS)
#include <unistd.h>
#endif

using namespace v8;

static std::string* applicationDir;
static std::string* appmetricsDir;
static bool running = false;
static loaderCoreFunctions* loaderApi;

struct MessageData {
    const std::string* source;
    void* data;
    unsigned int size;
    MessageData* next;
};

static MessageData* messageList = NULL;
static uv_mutex_t _messageListMutex;
static uv_mutex_t* messageListMutex = &_messageListMutex;
static uv_async_t _messageAsync;
static uv_async_t *messageAsync = &_messageAsync;

struct Listener {
    Nan::Callback *callback;
};

Listener* listener;

#define PROPERTIES_FILE "appmetrics.properties"
#define APPMETRICS_VERSION "99.99.99.29991231"


namespace monitorApi {
    void (*pushData)(const char*);
    void (*sendControl)(const char*, unsigned int, void*);
    // void (*registerListener)(void (*)(const std::string&, unsigned int, void*));
    void (*registerListener)(void (*)(const char*, unsigned int, void*));
}

static std::string toStdString(Local<String> s) {
    char *buf = new char[s->Length() + 1];
    s->WriteUtf8(buf);
#if defined(_ZOS)
    __atoe(buf);
#endif
    std::string result(buf);
    delete[] buf;
    return result;
}

static std::string asciiString(std::string s) {
#if defined(_ZOS)
    char* cp = new char[s.length() + 1];
    std::strcpy(cp, s.c_str());
    __etoa(cp);
    std::string returnString (cp);
    delete[] cp;
    return returnString;
#else
    return s;
#endif
}

static std::string nativeString(std::string s) {
#if defined(_ZOS)
    char* cp = new char[s.length() + 1];
    std::strcpy(cp, s.c_str());
    __atoe(cp);
    std::string returnString (cp);
    delete[] cp;
    return returnString;
#else
    return s;
#endif
}

#if defined(_WINDOWS)
//  std::cout << "Test empty: " << portDirname("") << std::endl;
//  std::cout << "Test /: " << portDirname("/") << std::endl;
//  std::cout << "Test a: " << portDirname("a") << std::endl;
//  std::cout << "Test a/b: " << portDirname("a/b") << std::endl;
//  std::cout << "Test /a/b: " << portDirname("/a/b") << std::endl;
//  std::cout << "Test //a/b: " << portDirname("//a/b") << std::endl;
//  std::cout << "Test /a//b: " << portDirname("/a//b") << std::endl;
//  std::cout << "Test ./: " << portDirname("./") << std::endl;
//  std::cout << "Test a/b/: " << portDirname("a/b/") << std::endl;
static std::string portDirname(const std::string& filename) {
    if (filename.length() == 0) return std::string(".");

    // Check for and ignore trailing slashes
    size_t lastpos = filename.length() - 1;
    while (lastpos > 0 && (filename[lastpos] == '/' || filename[lastpos] == '\\')) {
        lastpos--;
    }

    std::size_t slashpos = filename.rfind("/", lastpos);
    std::size_t bslashpos = filename.rfind("\\", lastpos);
    if (slashpos == std::string::npos && bslashpos == std::string::npos) {
        // No slashes
        return std::string(".");
    } else {
        std::size_t pos;
        if (slashpos != std::string::npos) pos = slashpos;
        else if (bslashpos != std::string::npos) pos = bslashpos;
        else pos = (slashpos > bslashpos) ? slashpos : bslashpos;
        if (pos == 0) {
            return filename.substr(0, 1);
        } else {
            // Remove trailing slashes
            size_t endpos = pos;
            while (endpos > 0 && (filename[endpos] == '/' || filename[endpos] == '\\')) {
                endpos--;
            }
            return filename.substr(0, endpos + 1);
        }
    }
}
#else
#include <libgen.h>
static std::string portDirname(const std::string& filename) {
    char *fname = new char[filename.length() + 1];
    std::strcpy(fname, filename.c_str());
    std::string result(dirname(fname));
    delete[] fname;
    return result;
}
#endif

static std::string fileJoin(const std::string& path, const std::string& filename) {
#if defined(_WINDOWS)
    static const std::string fileSeparator("\\");
#else
    static const std::string fileSeparator("/");
#endif
    return path + fileSeparator + filename;
}

static std::string* getModuleDir(Local<Object> module) {
    std::string moduleFilename(toStdString(module->Get(Nan::New<String>(asciiString("filename")).ToLocalChecked())->ToString()));
    return new std::string(portDirname(moduleFilename));
}

static Local<Object> getProcessObject() {
    return Nan::GetCurrentContext()->Global()->Get(Nan::New<String>(asciiString("process")).ToLocalChecked())->ToObject();
}

static std::string* findApplicationDir() {
    Local<Value> mainModule = getProcessObject()->Get(Nan::New<String>(asciiString("mainModule")).ToLocalChecked());
    if (!mainModule->IsUndefined()) {
        return getModuleDir(mainModule->ToObject());
    }
    return NULL;
}

static bool loadProperties() {
    bool loaded = false;

    // Load from application directory, if possible
    if (applicationDir != NULL) {
        std::string propFilename(fileJoin(*applicationDir, std::string(PROPERTIES_FILE)));
        loaded = loaderApi->loadPropertiesFile(propFilename.c_str());
    } else {
        loaderApi->logMessage(loggingLevel::debug, "Cannot load properties from application directory, main module not defined");
    }

    // Load from current working directory, if possible
    if (!loaded) {
        std::string propFilename(PROPERTIES_FILE);
        loaded = loaderApi->loadPropertiesFile(propFilename.c_str());
    }

    // Load from module directory
    if (!loaded && appmetricsDir != NULL) {
        std::string propFilename(fileJoin(*appmetricsDir, std::string(PROPERTIES_FILE)));
        loaded = loaderApi->loadPropertiesFile(propFilename.c_str());
    }
    return loaded;
}

#if defined(_WINDOWS)
static void* getFunctionFromLibrary(std::string libraryPath, std::string functionName) {
    HMODULE handle = LoadLibrary(libraryPath.c_str());
    if (!handle) {
        std::stringstream msg;
        msg << "Failed to open library " << libraryPath << "\n";
        if (loaderApi) {
            loaderApi->logMessage(warning, msg.str().c_str());
        } else {
            std::cerr << msg.str();
        }
        return NULL;
    }
    FARPROC function = GetProcAddress(handle, const_cast<char *>(functionName.c_str()));
    if (!function) {
        std::stringstream msg;
        msg << "Failed to find symbol '" << functionName << " in library " << libraryPath << "\n";
        if (loaderApi) {
            loaderApi->logMessage(warning, msg.str().c_str());
        } else {
            std::cerr << msg.str();
        }
        return NULL;
    }
    return (void*) function;
}
#else
static void* getFunctionFromLibrary(std::string libraryPath, std::string functionName) {
    void* handle = dlopen(libraryPath.c_str(), RTLD_LAZY);
    if (!handle) {
        std::stringstream msg;
        msg << "Failed to open library " << libraryPath << ":" << dlerror() << "\n";
        if (loaderApi) {
            loaderApi->logMessage(warning, msg.str().c_str());
        } else {
            std::cerr << msg.str();
        }
        return NULL;
    }
    void* function = dlsym(handle, functionName.c_str());
    if (!function) {
        std::stringstream msg;
        msg << "Failed to find symbol '" << functionName << " in library " << libraryPath << ":" << dlerror() << "\n";
        if (loaderApi) {
            loaderApi->logMessage(warning, msg.str().c_str());
        } else {
            std::cerr << msg.str();
        }
        dlclose(handle);
        return NULL;
    }
    return (void*)function;
}
#endif

static void* getMonitorApiFunction(std::string pluginPath, std::string functionName) {
#if defined(_WINDOWS)
    std::string libname = "hcapiplugin.dll";
#elif defined(__MACH__) || defined(__APPLE__)
    std::string libname = "libhcapiplugin.dylib";
#elif defined (__AIX__) || defined(AIX)
    std::string libname = "libhcapiplugin.a";
#else
    std::string libname = "libhcapiplugin.so";
#endif
    return getFunctionFromLibrary(fileJoin(pluginPath, libname), functionName);
}

static bool isMonitorApiValid() {
    return (monitorApi::pushData != NULL) && (monitorApi::sendControl != NULL) && (monitorApi::registerListener != NULL);
}

static bool initMonitorApi() {
    std::string pluginPath = nativeString(loaderApi->getProperty("com.ibm.diagnostics.healthcenter.plugin.path"));

    monitorApi::pushData = (void (*)(const char*)) getMonitorApiFunction(pluginPath, std::string("apiPushData"));
    monitorApi::sendControl = (void (*)(const char*, unsigned int, void*)) getMonitorApiFunction(pluginPath, std::string("sendControl"));
    monitorApi::registerListener = (void (*)(void (*func)(const char*, unsigned int, void*))) getMonitorApiFunction(pluginPath, std::string("registerListener"));

    return isMonitorApiValid();
}

typedef loaderCoreFunctions* (*LOADER_CORE)();

static bool initLoaderApi() {
#if defined(_WINDOWS)
    std::string libname = "agentcore.dll";
#elif defined(__MACH__) || defined(__APPLE__)
    std::string libname = "libagentcore.dylib";
#elif defined (__AIX__) || defined(AIX)
    std::string libname = "libagentcore.a";
#else
    std::string libname = "libagentcore.so";
#endif
    LOADER_CORE getLoaderCoreFunctions = (LOADER_CORE)getFunctionFromLibrary(fileJoin(*appmetricsDir, libname), "loader_entrypoint");
    if (getLoaderCoreFunctions) {
        loaderApi = getLoaderCoreFunctions();
    }

    return (loaderApi != NULL);
}

// set the property to given value (called from index.js)
NAN_METHOD(setOption) {
  if (info.Length() > 1) {
		Local<String> value = info[0]->ToString();
    Local<String> value1 = info[1]->ToString();
    loaderApi->setProperty(toStdString(value).c_str(),toStdString(value1).c_str());
    } else {
        loaderApi->logMessage(warning, "Incorrect number of parameters passed to setOption");
    }
}

// get property
NAN_METHOD(getOption) {
	if (info.Length() > 0) {
		Local<String> value = info[0]->ToString();
    std::string property = loaderApi->getProperty(toStdString(value).c_str());
#if NODE_VERSION_AT_LEAST(0, 11, 0) // > v0.11+
		v8::Local<v8::String> v8str = v8::String::NewFromUtf8(v8::Isolate::GetCurrent(), property.c_str());
#else
		v8::Local<v8::String> v8str = v8::String::New(property.c_str(), strlen(property.c_str()));
#endif
		info.GetReturnValue().Set<v8::String>(v8str);
	} else {
		loaderApi->logMessage(warning, "Incorrect number of parameters passed to getOption");
	}
}

NAN_METHOD(start) {
	if (!running) {
		running = true;
    loaderApi->init();
    loaderApi->start();
#if !defined(_ZOS)
	  headless::start();
#endif
  }
  if (!initMonitorApi()) {
    loaderApi->logMessage(warning, "Failed to initialize monitoring API");
  }
}

NAN_METHOD(stop) {
  if (running) {
    running = false;
    loaderApi->stop();
    loaderApi->shutdown();
#if !defined(_ZOS)
	  headless::stop();
#endif
  }
}

NAN_METHOD(spath) {
  Local<String> value = info[0]->ToString();
  loaderApi->setProperty("com.ibm.diagnostics.healthcenter.plugin.path", toStdString(value).c_str());
}

static void freePayload(MessageData* payload) {

    /* Clear fields to guard against the same payload being freed twice. */
    if( NULL == payload ) {
        return;
    }
    if( NULL != payload->data ) {
        free(payload->data);
        payload->data = NULL;
    }
    if( NULL != payload->source ) {
        delete payload->source;
        payload->source = NULL;
    }
    payload->next = NULL;
    delete payload;
}

static void emitMessage(uv_async_t *handle, int status) {
    Nan::HandleScope scope;

    // The event loop may coalesce multiple sends so the
    // emitMessage function needs to clear the entire queue.
    // Take the head of the queue and save it and mark the
    // queue as NULL to hold the lock for as short a time as
    // possible. (I'm libuv will queue another one if
    // uv_async_send is called once this has started we are
    // working.)

    uv_mutex_lock(messageListMutex);

    MessageData* currentMessage = messageList;
    messageList = NULL;

    uv_mutex_unlock(messageListMutex);

    while(currentMessage != NULL ) {

        Nan::TryCatch try_catch;

        const unsigned argc = 2;
        Local<Value> argv[argc];
        const char * source = (*currentMessage->source).c_str();

        Local<Object> buffer = Nan::CopyBuffer(asciiString(std::string((char*)currentMessage->data)).c_str(), currentMessage->size).ToLocalChecked();
        argv[0] = Nan::New<String>(source).ToLocalChecked();
        argv[1] = buffer;

        listener->callback->Call(argc, argv);
        if (try_catch.HasCaught()) {
            Nan::FatalException(try_catch);
        }
        MessageData* nextMessage = currentMessage->next;
        freePayload(currentMessage);
        currentMessage = nextMessage;
    }

}

//static void sendData(const std::string &sourceId, unsigned int size, void *data) {
static void sendData(const char* sourceId, unsigned int size, void *data) {
    if( size == 0 ) {
        return;
    }

    MessageData* payload = new MessageData();
    if( NULL == payload ) {
        return;
    }
    /*
     * Make a copies of data and source as they will be freed when this function returns
     */
    void* dataCopy = malloc(size);
    payload->source = new std::string(sourceId);
    if ( NULL == dataCopy || NULL == payload->source ) {
        freePayload(payload);
        return;
    }
    memcpy(dataCopy, data, size);
    payload->data = dataCopy;
    payload->size = size;
    payload->next = NULL;

    // Put the next message on the end of the queue.
    // (So they are sent in the same order we added them.)
    uv_mutex_lock(messageListMutex);
    MessageData** tail = &messageList;
    while( *tail != NULL ) {
        tail = &((*tail)->next);
    }
    (*tail) = payload;
    uv_mutex_unlock(messageListMutex);

    // Notify the event loop that there is a new message.
    // The event loop may coalesce multiple sends so the
    // emitMessage function needs to clear the entire queue.
    uv_async_send(messageAsync);
}

NAN_METHOD(nativeEmit) {

    if (!isMonitorApiValid()) {
        Nan::ThrowError(asciiString("Monitoring API is not initialized").c_str());
        //NanReturnUndefined();
    }

    std::stringstream contentss;
    if (info[0]->IsString()) {
        String::Utf8Value str(info[0]->ToString());
        char *c_arg = *str;
        contentss << c_arg << ":";
    } else {
        /*
         *  Error handling as we don't have a valid parameter
         */
        return Nan::ThrowError(asciiString("First argument must a event name string").c_str());
    }
    if (info[1]->IsString()) {
        String::Utf8Value str(info[1]->ToString());
        char *c_arg = *str;
        contentss << c_arg;

    } else {
        /*
         *  Error handling as we don't have a valid parameter
         */
        Nan::ThrowError(asciiString("Second argument must be a JSON string or a comma separated list of key value pairs").c_str());
        return;
    }
    contentss << '\n';
    std::string content = contentss.str();

    monitorApi::pushData(content.c_str());

}

NAN_METHOD(sendControlCommand) {

    if (!isMonitorApiValid()) {
        Nan::ThrowError(asciiString("Monitoring API is not initialized").c_str());
        return;
    }

    if (info[0]->IsString() && info[1]->IsString()) {
        String::Utf8Value topicArg(info[0]->ToString());
        String::Utf8Value commandArg(info[1]->ToString());
        std::string topic = std::string(*topicArg);
        std::string command = std::string(*commandArg);
        unsigned int length = command.length();
        monitorApi::sendControl(topic.c_str(), length, (void*)command.c_str());
    } else {
        return Nan::ThrowError(asciiString("Arguments must be strings containing the plugin name and control command").c_str());
    }

    return;

}

#if !defined(_ZOS)
NAN_METHOD(setHeadlessZipFunction) {
    if (!info[0]->IsFunction()) {
        return Nan::ThrowError("First argument must be a function");
    }
    Nan::Callback *callback = new Nan::Callback(info[0].As<Function>());
    headless::setZipFunction(callback);
}
#endif

NAN_METHOD(localConnect) {
    if (!isMonitorApiValid()) {
        Nan::ThrowError(asciiString("Monitoring API is not initialized").c_str());
        return;
    }

    if (!info[0]->IsFunction()) {
        return Nan::ThrowError(asciiString("First argument must be a callback function").c_str());
    }
    Nan::Callback *callback = new Nan::Callback(info[0].As<Function>());

    listener = new Listener();
    listener->callback = callback;

    monitorApi::registerListener(sendData);

    return;


}

#if defined(_LINUX)
void lrtime(const Nan::FunctionCallbackInfo<v8::Value>& info) {
    // Define the clock ids ourselves so we don't have to pull in system
    // headers.  CLOCK_MONOTONIC_COARSE in particular is not guaranteed
    // to be defined.
    enum {
        SL_CLOCK_INVALID = -1,
        SL_CLOCK_MONOTONIC = 1,
        SL_CLOCK_MONOTONIC_COARSE = 5
    };
    static clockid_t clock_id = SL_CLOCK_INVALID;
    if (clock_id == SL_CLOCK_INVALID) {
        // Check that CLOCK_MONOTONIC_COARSE is available and has a resolution
        // of at least 1 millisecond.  This clock is tied to CONFIG_HZ and can
        // have a granularity as low as one update every few hundred milliseconds.
        timespec ts = {0, 0};
        if (clock_getres(SL_CLOCK_MONOTONIC_COARSE, &ts) < 0 || ts.tv_sec > 0 || ts.tv_nsec > 1000 * 1000) {
            clock_id = SL_CLOCK_MONOTONIC;  // Unavailable or unsuitable.
        } else {
            clock_id = SL_CLOCK_MONOTONIC_COARSE;
        }
    }
    timespec ts = {0, 0};
    clock_gettime(clock_id, &ts);

#if NODE_VERSION_AT_LEAST(0, 11, 0) // > v0.11+
    v8::Isolate* isolate = info.GetIsolate();
    v8::Local<v8::Array> result = v8::Array::New(isolate, 2);
    result->Set(0, v8::Number::New(isolate, ts.tv_sec));
    result->Set(1, v8::Integer::NewFromUnsigned(isolate, ts.tv_nsec));
#else
    v8::Local<v8::Array> result = v8::Array::New(2);
    result->Set(0, v8::Number::New(ts.tv_sec));
    result->Set(1, v8::Integer::NewFromUnsigned(ts.tv_nsec));
#endif

    info.GetReturnValue().Set(result);
}
#endif

// Unfortunately native modules don't get a reference
// to require.cache as this happens in Module._compile()
// and native modules aren't compiled, they are loaded
// directly by NativeModule.require() (in Module._load())
// So we need to get it from Module._cache instead (by
// executing require('module')._cache)
static Local<Object> getRequireCache(Local<Object> module) {
    Nan::EscapableHandleScope scope;
    Local<Value> args[] = { Nan::New<String>(asciiString("module")).ToLocalChecked() };
    Local<String> require_string = Nan::New<String>(asciiString("require")).ToLocalChecked();
    Local<Value> require_v = Nan::Get(module, require_string).ToLocalChecked();
    Local<Object> require_obj = Nan::To<Object>(require_v).ToLocalChecked();
    Local<Object> global_obj = Nan::GetCurrentContext()->Global();
    Local<Value> module_v = Nan::CallAsFunction(require_obj, global_obj, 1, args).ToLocalChecked();
    Local<Object> module_obj = Nan::To<Object>(module_v).ToLocalChecked();
    Local<String> cache_string = Nan::New<String>(asciiString("_cache")).ToLocalChecked();
    Local<Value> cache_v = Nan::Get(module_obj, cache_string).ToLocalChecked();
    Local<Object> cache_obj = Nan::To<Object>(cache_v).ToLocalChecked();
    return scope.Escape(cache_obj);
}

// Check whether the filepath given looks like it's a file in the
// appmetrics npm module directory. Here we are checking it ends
// with appmetrics/somefile, but perhaps node_modules/appmetrics/somefile
// would be more accurate?
static bool isAppMetricsFile(std::string expected, std::string potentialMatch) {
    std::string endsWithPosix = "appmetrics/" + expected;
    std::string endsWithWindows = "appmetrics\\" + expected;

    int startAt = potentialMatch.length() - endsWithPosix.length();
    if (startAt >= 0 && potentialMatch.compare(startAt, endsWithPosix.length(), endsWithPosix) == 0) {
        return true;
    }

    startAt = potentialMatch.length() - endsWithWindows.length();
    if (startAt >= 0 && potentialMatch.compare(startAt, endsWithWindows.length(), endsWithWindows) == 0) {
        return true;
    }

    return false;
}

static bool isGlobalAgent(Local<Object> module) {
    Nan::HandleScope scope;
    Local<Value> parent = module->Get(Nan::New<String>(asciiString("parent")).ToLocalChecked());
    if (parent->IsObject()) {
        Local<Value> filename = parent->ToObject()->Get(Nan::New<String>(asciiString("filename")).ToLocalChecked());
        if (filename->IsString() && isAppMetricsFile("index.js", toStdString(filename->ToString()))) {
            Local<Value> grandparent = parent->ToObject()->Get(Nan::New<String>(asciiString("parent")).ToLocalChecked());
            Local<Value> gpfilename = grandparent->ToObject()->Get(Nan::New<String>(asciiString("filename")).ToLocalChecked());
            if (gpfilename->IsString() && isAppMetricsFile("launcher.js", toStdString(gpfilename->ToString()))) {
                return true;
            }
        }
    }
    return false;
}

// Check if a global appmetrics agent module is already loaded.
// This is actually searching the module cache for a module with filepath
// ending .../appmetrics/launcher.js
static bool isGlobalAgentAlreadyLoaded(Local<Object> module) {
    Nan::HandleScope scope;
    Local<Object> cache = getRequireCache(module);
    Local<Array> props = cache->GetOwnPropertyNames();
    if (props->Length() > 0) {
        for (uint32_t i=0; i<props->Length(); i++) {
            Local<Value> entry = props->Get(i);
            if (entry->IsString() && isAppMetricsFile("launcher.js", toStdString(entry->ToString()))) {
                return true;
            }
        }
    }
    return false;
}

#if !defined(_ZOS)
void zip(const char* outputDir) {
	headless::zip(outputDir);
}
#endif

void init(Local<Object> exports, Local<Object> module) {
    /*
     * Throw an error if appmetrics has already been loaded globally
     */
    Nan::HandleScope scope;
    if (!isGlobalAgent(module) && isGlobalAgentAlreadyLoaded(module)) {
        Nan::ThrowError(asciiString("Conflicting appmetrics module was already loaded by node-hc. Try running with node instead.").c_str());
        return;
    }
    // Setup global data mutex
    uv_mutex_init(messageListMutex);

    // Setup message sending callback and sure it does not keep us alive.
    uv_async_init(uv_default_loop(), messageAsync, (uv_async_cb)emitMessage);
    uv_unref((uv_handle_t*) messageAsync);

    /*
     * Set exported functions
     */
    exports->Set(Nan::New<String>(asciiString("getOption")).ToLocalChecked(), Nan::New<FunctionTemplate>(getOption)->GetFunction());
    exports->Set(Nan::New<String>(asciiString("setOption")).ToLocalChecked(), Nan::New<FunctionTemplate>(setOption)->GetFunction());
    exports->Set(Nan::New<String>(asciiString("start")).ToLocalChecked(), Nan::New<FunctionTemplate>(start)->GetFunction());
    exports->Set(Nan::New<String>(asciiString("spath")).ToLocalChecked(), Nan::New<FunctionTemplate>(spath)->GetFunction());
    exports->Set(Nan::New<String>(asciiString("stop")).ToLocalChecked(), Nan::New<FunctionTemplate>(stop)->GetFunction());
    exports->Set(Nan::New<String>(asciiString("localConnect")).ToLocalChecked(), Nan::New<FunctionTemplate>(localConnect)->GetFunction());
    exports->Set(Nan::New<String>(asciiString("nativeEmit")).ToLocalChecked(), Nan::New<FunctionTemplate>(nativeEmit)->GetFunction());
    exports->Set(Nan::New<String>(asciiString("sendControlCommand")).ToLocalChecked(), Nan::New<FunctionTemplate>(sendControlCommand)->GetFunction());
#if !defined(_ZOS)
    exports->Set(Nan::New<String>(asciiString("setHeadlessZipFunction")).ToLocalChecked(), Nan::New<FunctionTemplate>(setHeadlessZipFunction)->GetFunction());
#endif
#if defined(_LINUX)
    exports->Set(Nan::New<String>("lrtime").ToLocalChecked(), Nan::New<FunctionTemplate>(lrtime)->GetFunction());
#endif
#if NODE_VERSION_AT_LEAST(0, 11, 0) // > v0.11+
    exports->Set(Nan::New<String>(asciiString("getObjectHistogram")).ToLocalChecked(), Nan::New<FunctionTemplate>(getObjectHistogram)->GetFunction());
#endif
    /*
     * Initialize healthcenter core library
     */
    applicationDir = findApplicationDir();
    appmetricsDir = getModuleDir(module);
    if (!initLoaderApi()) {
        Nan::ThrowError(asciiString("Failed to initialize Agent Core library").c_str());
        return;
    }
    if (!loadProperties()) {
        loaderApi->logMessage(warning, "Failed to load appmetrics.properties file");
    }
#if !defined(_ZOS)
    loaderApi->registerZipFunction(&zip);
#endif
    loaderApi->setLogLevels();
    /* changing this to pass agentcore.version and adding new appmetrics.version for use in the client */
    loaderApi->setProperty("agentcore.version", loaderApi->getAgentVersion());
    loaderApi->setProperty("appmetrics.version", APPMETRICS_VERSION);

    /* Initialize watchdog directly so that bindings can be created */
    Isolate* isolate = v8::Isolate::GetCurrent();
    watchdog::Initialize(isolate, exports);

    /*
     * Log startup message with version information
     */
    std::stringstream msg;
    msg << "Node Application Metrics " << APPMETRICS_VERSION << " (Agent Core " << nativeString(loaderApi->getAgentVersion()) << ")";
    loaderApi->logMessage(info, msg.str().c_str());
}

NODE_MODULE(appmetrics, init)
