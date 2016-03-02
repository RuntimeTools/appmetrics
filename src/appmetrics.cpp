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
#include "AgentExtensions.h"
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

using namespace v8;
using namespace ibmras::common::logging;

static std::string* applicationDir;
static std::string* appmetricsDir;
static bool running = false;
static loaderCoreFunctions* loaderApi;

#define PROPERTIES_FILE "appmetrics.properties"
#define APPMETRICS_VERSION "99.99.99.29991231"


namespace monitorApi {
	void (*pushData)(std::string&);
	void (*sendControl)(std::string&, unsigned int, void*);
	void (*registerListener)(void (*)(const std::string&, unsigned int, void*));
}

static std::string toStdString(Local<String> s) {
	char *buf = new char[s->Length() + 1];
	s->WriteUtf8(buf);
	std::string result(buf);
	delete[] buf;
	return result;
}

#if defined(_WINDOWS)
//	std::cout << "Test empty: " << portDirname("") << std::endl;
//	std::cout << "Test /: " << portDirname("/") << std::endl;
//	std::cout << "Test a: " << portDirname("a") << std::endl;
//	std::cout << "Test a/b: " << portDirname("a/b") << std::endl;
//	std::cout << "Test /a/b: " << portDirname("/a/b") << std::endl;
//	std::cout << "Test //a/b: " << portDirname("//a/b") << std::endl;
//	std::cout << "Test /a//b: " << portDirname("/a//b") << std::endl;
//	std::cout << "Test ./: " << portDirname("./") << std::endl;
//	std::cout << "Test a/b/: " << portDirname("a/b/") << std::endl;
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

static std::string* getModuleDir(Handle<Object> module) {
	std::string moduleFilename(toStdString(module->Get(Nan::New<String>("filename").ToLocalChecked())->ToString()));
	return new std::string(portDirname(moduleFilename));
}

static Local<Object> getProcessObject() {
	return Nan::GetCurrentContext()->Global()->Get(Nan::New<String>("process").ToLocalChecked())->ToObject();
}

static std::string* findApplicationDir() {
	Handle<Value> mainModule = getProcessObject()->Get(Nan::New<String>("mainModule").ToLocalChecked());
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
		loaderApi->logMessage(debug, "Cannot load properties from application directory, main module not defined");
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
#else
	std::string libname = "libhcapiplugin.so";
#endif
	return getFunctionFromLibrary(fileJoin(pluginPath, libname), functionName);
}

static bool isMonitorApiValid() {
	return (monitorApi::pushData != NULL) && (monitorApi::sendControl != NULL) && (monitorApi::registerListener != NULL);
}

static bool initMonitorApi() {
	std::string pluginPath = loaderApi->getProperty("com.ibm.diagnostics.healthcenter.plugin.path");

	monitorApi::pushData = (void (*)(std::string&)) getMonitorApiFunction(pluginPath, std::string("pushData"));
	monitorApi::sendControl = (void (*)(std::string&, unsigned int, void*)) getMonitorApiFunction(pluginPath, std::string("sendControl"));
	monitorApi::registerListener = (void (*)(void (*func)(const std::string&, unsigned int, void*))) getMonitorApiFunction(pluginPath, std::string("registerListener"));

	return isMonitorApiValid();
}

static bool initLoaderApi() {
#if defined(_WINDOWS)
	std::string libname = "agentcore.dll";
#elif defined(__MACH__) || defined(__APPLE__)
	std::string libname = "libagentcore.dylib";
#else
	std::string libname = "libagentcore.so";
#endif
	LOADER_CORE getLoaderCoreFunctions = (LOADER_CORE)getFunctionFromLibrary(fileJoin(*appmetricsDir, libname), "loader_entrypoint");
	if (getLoaderCoreFunctions) {
		loaderApi = getLoaderCoreFunctions();
	}

	return (loaderApi != NULL);
}

NAN_METHOD(start) {

	if (!running) {
		running = true;

		loaderApi->init();

		// Force MQTT on for now
		loaderApi->setProperty("com.ibm.diagnostics.healthcenter.mqtt", "on");
		loaderApi->start();
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
	}

}

NAN_METHOD(spath) {

	Local<String> value = info[0]->ToString();

	loaderApi->setProperty("com.ibm.diagnostics.healthcenter.plugin.path", toStdString(value).c_str());


}

struct MessageData {
	const std::string* source;
	void* data;
	unsigned int size;
};

struct Listener {
	Nan::Callback *callback;
};


Listener* listener;



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
	delete payload;
}

static void cleanupData(uv_handle_t *handle) {

	if( NULL != handle ) {
		MessageData* payload = static_cast<MessageData*>(handle->data);
		/* Guard against being called twice. */
		handle->data = NULL;
		freePayload(payload);
	}
	delete handle;

}

static void emitMessage(uv_async_t *handle, int status) {
	Nan::HandleScope scope;
	MessageData* payload = static_cast<MessageData*>(handle->data);

	TryCatch try_catch;
	const unsigned argc = 2;
	Local<Value> argv[argc];
	const char * source = (*payload->source).c_str();

	Local<Object> buffer = Nan::CopyBuffer((char*)payload->data, payload->size).ToLocalChecked();
	argv[0] = Nan::New<String>(source).ToLocalChecked();
	argv[1] = buffer;

	listener->callback->Call(argc, argv);
	if (try_catch.HasCaught()) {
#if NODE_VERSION_AT_LEAST(0, 11, 0) // > v0.11+
		node::FatalException(v8::Isolate::GetCurrent(), try_catch);
#else
	node::FatalException(try_catch);
#endif

	}
	uv_close((uv_handle_t*) handle, cleanupData);
}

static void sendData(const std::string &sourceId, unsigned int size, void *data) {
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
	uv_async_t *async = new uv_async_t;
	if ( NULL == dataCopy || NULL == payload->source || NULL == async ) {
		freePayload(payload);
		return;
	}
	memcpy(dataCopy, data, size);
	payload->data = dataCopy;
	payload->size = size;

	async->data = payload;
	uv_async_init(uv_default_loop(), async, (uv_async_cb)emitMessage);
	uv_async_send(async);
}

NAN_METHOD(nativeEmit) {
	
	if (!isMonitorApiValid()) {
		Nan::ThrowError("Monitoring API is not initialized");
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
		return Nan::ThrowError("First argument must a event name string");
	}
	if (info[1]->IsString()) {
		String::Utf8Value str(info[1]->ToString());
		char *c_arg = *str;
		contentss << c_arg;
	} else {
		/*
		 *  Error handling as we don't have a valid parameter
		 */
		Nan::ThrowError("Second argument must be a JSON string or a comma separated list of key value pairs");
		return;
	}
	contentss << '\n';
	std::string content = contentss.str();

	monitorApi::pushData(content);

}

NAN_METHOD(sendControlCommand) {
	
	if (!isMonitorApiValid()) {
		Nan::ThrowError("Monitoring API is not initialized");
		return;
	}

	if (info[0]->IsString() && info[1]->IsString()) {
		String::Utf8Value topicArg(info[0]->ToString());
		String::Utf8Value commandArg(info[1]->ToString());
		std::string topic = std::string(*topicArg);
		std::string command = std::string(*commandArg);
		unsigned int length = command.length();
		monitorApi::sendControl(topic, length, (void*)command.c_str());
	} else {
		return Nan::ThrowError("Arguments must be strings containing the plugin name and control command");
	}

	return;

}


NAN_METHOD(localConnect) {
	
	if (!isMonitorApiValid()) {
		Nan::ThrowError("Monitoring API is not initialized");
		return;
	}

	if (!info[0]->IsFunction()) {
		return Nan::ThrowError("First argument must be a callback function");
	}
	Nan::Callback *callback = new Nan::Callback(info[0].As<Function>());

	listener = new Listener();
	listener->callback = callback;

	monitorApi::registerListener(sendData);

	return;


}

// Unfortunately native modules don't get a reference
// to require.cache as this happens in Module._compile()
// and native modules aren't compiled, they are loaded
// directly by NativeModule.require() (in Module._load())
// So we need to get it from Module._cache instead (by
// executing require('module')._cache)
static Local<Object> getRequireCache(Handle<Object> module) {
	Nan::EscapableHandleScope scope;
	Handle<Value> args[] = { Nan::New<String>("module").ToLocalChecked() };
	Local<Value> m = module->Get(Nan::New<String>("require").ToLocalChecked())->ToObject()->CallAsFunction(Nan::GetCurrentContext()->Global(), 1, args);
	Local<Object> cache = m->ToObject()->Get(Nan::New<String>("_cache").ToLocalChecked())->ToObject();
	return scope.Escape(cache);
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

// Check if this appmetrics agent native module is loaded via the node-hc command.
// This is actually checking if this module has appmetrics/launcher.js as it's grandparent.
// For reference:
// A locally loaded module would have ancestry like:
//   ...
//   ^-- some_module_that_does_require('appmetrics') (grandparent)
//       ^--- .../node_modules/appmetrics/index.js (parent)
//            ^-- .../node_modules/appmetrics/appmetrics.node (this)
//
// A globally loaded module would have ancestry like:
//   .../node_modules/appmetrics/launcher.js (grandparent)
//   ^--- .../node_modules/appmetrics/index.js (parent)
//        ^-- .../node_modules/appmetrics/appmetrics.node (this)
//
static bool isGlobalAgent(Handle<Object> module) {
	Nan::HandleScope scope;
	Local<Value> parent = module->Get(Nan::New<String>("parent").ToLocalChecked());
	if (parent->IsObject()) {
		Local<Value> filename = parent->ToObject()->Get(Nan::New<String>("filename").ToLocalChecked());
		if (filename->IsString() && isAppMetricsFile("index.js", toStdString(filename->ToString()))) {
			Local<Value> grandparent = parent->ToObject()->Get(Nan::New<String>("parent").ToLocalChecked());
			Local<Value> gpfilename = grandparent->ToObject()->Get(Nan::New<String>("filename").ToLocalChecked());
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
static bool isGlobalAgentAlreadyLoaded(Handle<Object> module) {
	//Nan::HandleScope scope;
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

void init(Handle<Object> exports, Handle<Object> module) {
	/*
	 * Throw an error if appmetrics has already been loaded globally
	 */
	Nan::HandleScope scope;
	if (!isGlobalAgent(module) && isGlobalAgentAlreadyLoaded(module)) {
		Nan::ThrowError("Conflicting appmetrics module was already loaded by node-hc. Try running with node instead.");
		return;
	}

	/*
	 * Set exported functions
	 */
	exports->Set(Nan::New<String>("start").ToLocalChecked(), Nan::New<FunctionTemplate>(start)->GetFunction());
	exports->Set(Nan::New<String>("spath").ToLocalChecked(), Nan::New<FunctionTemplate>(spath)->GetFunction());
	exports->Set(Nan::New<String>("stop").ToLocalChecked(), Nan::New<FunctionTemplate>(stop)->GetFunction());
	exports->Set(Nan::New<String>("localConnect").ToLocalChecked(), Nan::New<FunctionTemplate>(localConnect)->GetFunction());
	exports->Set(Nan::New<String>("nativeEmit").ToLocalChecked(), Nan::New<FunctionTemplate>(nativeEmit)->GetFunction());
	exports->Set(Nan::New<String>("sendControlCommand").ToLocalChecked(), Nan::New<FunctionTemplate>(sendControlCommand)->GetFunction());

	/*
	 * Initialize healthcenter core library
	 */
	applicationDir = findApplicationDir();
	appmetricsDir = getModuleDir(module);

	if (!initLoaderApi()) {
		Nan::ThrowError("Failed to initialize Agent Core library");
		return;
	}
	if (!loadProperties()) {
		loaderApi->logMessage(warning, "Failed to load appmetrics.properties file");
	}
	loaderApi->setLogLevels();
	/* changing this to pass agentcore.version and adding new appmetrics.version for use in the client */
	loaderApi->setProperty("agentcore.version", loaderApi->getAgentVersion().c_str());
	loaderApi->setProperty("appmetrics.version", APPMETRICS_VERSION);

	/*
	 * Log startup message with version information
	 */
	std::stringstream msg;
	msg << "Node Application Metrics " << APPMETRICS_VERSION << " (Agent Core " << loaderApi->getAgentVersion() << ")";
	loaderApi->logMessage(info, msg.str().c_str());
}

NODE_MODULE(appmetrics, init)
