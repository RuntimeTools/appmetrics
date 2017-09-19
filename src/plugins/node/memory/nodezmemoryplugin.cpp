/*******************************************************************************
 * Copyright 2016 IBM Corp.
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
#ifndef _XOPEN_SOURCE_EXTENDED
#define _XOPEN_SOURCE_EXTENDED 1
#endif

#if defined(_ZOS)
#include <unistd.h>
#endif

#include "ibmras/monitoring/AgentExtensions.h"
#include "Typesdef.h"
#include "v8.h"
#include "nan.h"
#include <cstring>
#include <sstream>
#include <string>
#include <sys/time.h>

#define DEFAULT_CAPACITY 10240
#define NODEZMEMPLUGIN_DECL
#define MEMORY_INTERVAL 2000

namespace plugin {
	agentCoreFunctions api;
	uint32 provid = 0;
	bool timingOK;
  uv_timer_t *timer;
}

using namespace v8;

// Constant strings for message composition
const std::string COMMA = ",";
const std::string EQUALS = "=";
const std::string MEMORY_SOURCE = "MemorySource";
const std::string TOTAL_MEMORY = "totalphysicalmemory";
const std::string PHYSICAL_MEMORY = "physicalmemory";
const std::string PRIVATE_MEMORY = "privatememory";
const std::string VIRTUAL_MEMORY = "virtualmemory";
const std::string FREE_PHYSICAL_MEMORY = "freephysicalmemory";
const std::string TOTAL_PHYSICAL_MEMORY = "totalphysicalmemory";

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

static char* NewCString(const std::string& s) {
	char *result = new char[s.length() + 1];
	std::strcpy(result, s.c_str());
	return result;
}

static void cleanupHandle(uv_handle_t *handle) {
	delete handle;
}

static int64 getTime() {
        struct timeval tv;
        gettimeofday(&tv, NULL);
        return ((int64) tv.tv_sec)*1000 + tv.tv_usec/1000;
}

static int64 getTotalPhysicalMemorySize() {
  plugin::api.logMessage(loggingLevel::debug, "[memory_node] >>getTotalPhysicalMemorySize()");
  Nan::HandleScope scope;
  Local<Object> global = Nan::GetCurrentContext()->Global();
  Local<Object> appmetObject = global->Get(Nan::New<String>(asciiString("Appmetrics")).ToLocalChecked())->ToObject();
  Local<Value> totalMemValue = appmetObject->Get(Nan::New<String>(asciiString("getTotalPhysicalMemorySize")).ToLocalChecked());
  if (totalMemValue->IsFunction()) {
    plugin::api.logMessage(loggingLevel::debug, "[memory_node] getTotalPhysicalMemorySize is a function");
  } else {
    plugin::api.logMessage(loggingLevel::debug, "[memory_node] getTotalPhysicalMemorySize is NOT a function");
    return -1;
  }
  Local<Function> totalMemFunc = Local<Function>::Cast(totalMemValue);
  Local<Value> args[0];
  Local<Value> result = totalMemFunc->Call(global, 0, args);
  if (result->IsNumber()) {
    plugin::api.logMessage(loggingLevel::debug, "[memory_node] result of calling getTotalPhysicalMemorySize is a number");
    return result->IntegerValue();
  } else {
    plugin::api.logMessage(loggingLevel::debug, "[memory_node] result of calling getTotalPhysicalMemorySize is NOT a number");
    return -1;
  }
}

static int64 getProcessPhysicalMemorySize() {
  //TODO: see if we can improve this on z/OS
  return -1;
}

static int64 getProcessPrivateMemorySize() {
  //TODO: see if we can improve this on z/OS
  return -1;
}

static int64 getProcessVirtualMemorySize() {
  //TODO: see if we can improve this on z/OS
  return -1;
}

static int64 getFreePhysicalMemorySize() {
  //TODO: see if we can improve this on z/OS
  return -1;
}

static void GetMemoryInformation(uv_timer_s *data) {
  plugin::api.logMessage(fine, "[memory_node] Getting memory information");
	std::stringstream contentss;

  contentss << MEMORY_SOURCE << COMMA;
	contentss << getTime() << COMMA;
	contentss << TOTAL_MEMORY    << EQUALS << getTotalPhysicalMemorySize()   << COMMA;
	contentss << PHYSICAL_MEMORY << EQUALS << getProcessPhysicalMemorySize() << COMMA;
	contentss << PRIVATE_MEMORY  << EQUALS << getProcessPrivateMemorySize()  << COMMA;
	contentss << VIRTUAL_MEMORY  << EQUALS << getProcessVirtualMemorySize()  << COMMA;
	contentss << FREE_PHYSICAL_MEMORY << EQUALS << getFreePhysicalMemorySize() << std::endl;

	std::string content = contentss.str();
  // Send data
  plugin::api.logMessage(loggingLevel::debug, "[memory_node] Content of message:");
  plugin::api.logMessage(loggingLevel::debug, content.c_str());
  plugin::api.logMessage(loggingLevel::debug, "[memory_node] Constructing message object");
	monitordata mdata;
	mdata.persistent = false;
	mdata.provID = plugin::provid;
	mdata.sourceID = 0;
	mdata.size = static_cast<uint32>(content.length());
	mdata.data = content.c_str();

	plugin::api.agentPushData(&mdata);

}

pushsource* createPushSource(uint32 srcid, const char* name) {
        pushsource *src = new pushsource();
        src->header.name = name;
        std::string desc("Memory plugin for Application Metrics for Node.js");
        desc.append(name);
        src->header.description = NewCString(desc);
        src->header.sourceID = srcid;
        src->next = NULL;
        src->header.capacity = DEFAULT_CAPACITY;
        return src;
}

extern "C" {
	NODEZMEMPLUGIN_DECL pushsource* ibmras_monitoring_registerPushSource(agentCoreFunctions api, uint32 provID) {
	    plugin::api = api;
	    plugin::api.logMessage(loggingLevel::debug, "[memory_node] Registering push sources");

	    pushsource *head = createPushSource(0, "memory_node");
	    plugin::provid = provID;
	    return head;
	}

	NODEZMEMPLUGIN_DECL int ibmras_monitoring_plugin_init(const char* properties) {
		return 0;
	}

	NODEZMEMPLUGIN_DECL int ibmras_monitoring_plugin_start() {
		plugin::api.logMessage(fine, "[memory_node] Starting");
    plugin::timer = new uv_timer_t;
		uv_timer_init(uv_default_loop(), plugin::timer);
		uv_unref((uv_handle_t*) plugin::timer); // don't prevent event loop exit
    uv_timer_start(plugin::timer, GetMemoryInformation, MEMORY_INTERVAL, MEMORY_INTERVAL);
    return 0;
	}

	NODEZMEMPLUGIN_DECL int ibmras_monitoring_plugin_stop() {
		plugin::api.logMessage(fine, "[memory_node] Stopping");
    uv_timer_stop(plugin::timer);
		uv_close((uv_handle_t*) plugin::timer, cleanupHandle);
		return 0;
	}

	NODEZMEMPLUGIN_DECL const char* ibmras_monitoring_getVersion() {
		return "1.0";
	}
}
