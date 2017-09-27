/*******************************************************************************
 * Copyright 2014,2015 IBM Corp.
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
#if defined(_ZOS)
#define _XOPEN_SOURCE_EXTENDED 1
#undef _ALL_SOURCE
#endif

#include "ibmras/monitoring/AgentExtensions.h"
#include "Typesdef.h"
#include "v8.h"
#include "nan.h"
//#include "node_version.h"
#include <cstring>
#include <sstream>
#include <string>
#if defined(_WINDOWS)
#include <ctime>
#else
#include <sys/time.h>
#endif

#define DEFAULT_CAPACITY 10240

#if defined(_WINDOWS)
#define NODEGCPLUGIN_DECL __declspec(dllexport)	/* required for DLLs to export the plugin functions */
#else
#define NODEGCPLUGIN_DECL
#endif

namespace plugin {
	agentCoreFunctions api;
	uint32 provid = 0;
	bool timingOK;
        uint64_t gcSteadyStart, gcSteadyEnd;
}

using namespace v8;

static char* NewCString(const std::string& s) {
	char *result = new char[s.length() + 1];
	std::strcpy(result, s.c_str());
	return result;
}

static bool GetSteadyTime(uint64_t* now) {
  *now = uv_hrtime();
  return true;
}
static uint64_t CalculateDuration(uint64_t start, uint64_t finish) {
	return (finish - start) / 1000000;
}

/*
 * OSX
 */
#if defined(__MACH__) || defined(__APPLE__) || defined(_ZOS)
static unsigned long long GetRealTime() {
	struct timeval tv;
	gettimeofday(&tv, NULL);
	return (unsigned long long)(tv.tv_sec) * 1000 +
	       (unsigned long long)(tv.tv_usec) / 1000;
}
#endif

/*
 * Linux
 */
#if defined(_LINUX) || defined(_AIX)
static unsigned long long GetRealTime() {
	struct timeval tv;
	gettimeofday(&tv, NULL);
	return (unsigned long long)(tv.tv_sec) * 1000 +
	       (unsigned long long)(tv.tv_usec) / 1000;
}
#endif

/*
 * Windows
 */
#ifdef _WINDOWS
static unsigned long long GetRealTime() {
	SYSTEMTIME st;
	GetSystemTime(&st);
	return std::time(NULL) * 1000 + st.wMilliseconds;
}
#endif

void beforeGC(v8::Isolate *isolate, GCType type, GCCallbackFlags flags) {
	plugin::timingOK = GetSteadyTime(&plugin::gcSteadyStart);
}

void afterGC(v8::Isolate *isolate, GCType type, GCCallbackFlags flags) {
	unsigned long long gcRealEnd;
	
	// GC pause time
	if (plugin::timingOK) {
		plugin::timingOK = GetSteadyTime(&plugin::gcSteadyEnd);	
	}
	const uint64 gcDuration = plugin::timingOK ? CalculateDuration(plugin::gcSteadyStart, plugin::gcSteadyEnd) : 0; 

	// Get "real" time
	gcRealEnd = GetRealTime();

	// GC type
	const char *gcType = NULL;
        switch (type) {
          case kGCTypeMarkSweepCompact: gcType = "M"; break;
          case kGCTypeScavenge: gcType = "S"; break;
#if NODE_VERSION_AT_LEAST(5, 0, 0)
          case kGCTypeIncrementalMarking: gcType = "I"; break;
          case kGCTypeProcessWeakCallbacks: gcType = "W"; break;
#endif
          // Should never happen, but call it minor if type is unrecognized.
          default: gcType = "S"; break;
        }

	// GC heap stats
	HeapStatistics hs;

	Nan::GetHeapStatistics(&hs);

	std::stringstream contentss;
	contentss << "NodeGCData";
	contentss << "," << gcRealEnd; 
	contentss << "," << gcType;
	contentss << "," << static_cast<uint64_t>(hs.total_heap_size());
	contentss << "," << static_cast<uint64_t>(hs.used_heap_size());
	contentss << "," << gcDuration;
	contentss << '\n';
	
	std::string content = contentss.str();

	// Send data
	monitordata data;
	data.persistent = false;
	data.provID = plugin::provid;
	data.sourceID = 0;
	data.size = static_cast<uint32>(content.length());
	data.data = content.c_str();
	plugin::api.agentPushData(&data);
}

pushsource* createPushSource(uint32 srcid, const char* name) {
        pushsource *src = new pushsource();
        src->header.name = name;
        std::string desc("Description for ");
        desc.append(name);
        src->header.description = NewCString(desc);
        src->header.sourceID = srcid;
        src->next = NULL;
        src->header.capacity = DEFAULT_CAPACITY;
        return src;
}

extern "C" {
	NODEGCPLUGIN_DECL pushsource* ibmras_monitoring_registerPushSource(agentCoreFunctions api, uint32 provID) {
	    plugin::api = api;
	    plugin::api.logMessage(loggingLevel::debug, "[gc_node] Registering push sources");
	
	    pushsource *head = createPushSource(0, "gc_node");
	    plugin::provid = provID;
	    return head;
	}
	
	NODEGCPLUGIN_DECL int ibmras_monitoring_plugin_init(const char* properties) {
		return 0;
	}
	
	NODEGCPLUGIN_DECL int ibmras_monitoring_plugin_start() {
		plugin::api.logMessage(fine, "[gc_node] Starting");

		v8::Isolate::GetCurrent()->AddGCPrologueCallback(beforeGC);
		v8::Isolate::GetCurrent()->AddGCEpilogueCallback(afterGC);
		return 0;
	}

	NODEGCPLUGIN_DECL int ibmras_monitoring_plugin_stop() {
		plugin::api.logMessage(fine, "[gc_node] Stopping");
		// TODO Unhook GC hooks...
		return 0;
	}
	
	NODEGCPLUGIN_DECL const char* ibmras_monitoring_getVersion() {
		return "1.0";
	}
}
