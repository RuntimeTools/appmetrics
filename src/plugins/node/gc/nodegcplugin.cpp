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
	
#ifdef _WINDOWS
	LARGE_INTEGER gcSteadyStart, gcSteadyEnd;
#elif defined(_LINUX) || defined(_AIX)
	struct timespec gcSteadyStart, gcSteadyEnd;
#elif defined(__MACH__) || defined(__APPLE__)
	struct timeval gcSteadyStart, gcSteadyEnd;
#endif
}

using namespace v8;

static char* NewCString(const std::string& s) {
	char *result = new char[s.length() + 1];
	std::strcpy(result, s.c_str());
	return result;
}

/*
 * OSX
 */
#if defined(__MACH__) || defined(__APPLE__)
static bool GetSteadyTime(struct timeval* tv) {
	//int rc = clock_gettime(CLOCK_MONOTONIC, tv);
	int rc = gettimeofday(tv, 0);
	return rc == 0;
}
static uint64 CalculateDuration(struct timeval start, struct timeval finish) {
	return static_cast<uint64>((finish.tv_sec - start.tv_sec) * 1000 + (finish.tv_usec - start.tv_usec) / 1000);
}
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
static bool GetSteadyTime(struct timespec* tv) {
	int rc = clock_gettime(CLOCK_MONOTONIC, tv);
	return rc == 0;
}
static uint64 CalculateDuration(struct timespec start, struct timespec finish) {
	return static_cast<uint64>((finish.tv_sec - start.tv_sec) * 1000 + (finish.tv_nsec - start.tv_nsec) / 1000000);
}
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
static LARGE_INTEGER freq;
static bool freqInitialized = FALSE;
static bool GetSteadyTime(LARGE_INTEGER* pcount) {
	if (!freqInitialized) {
		if (QueryPerformanceFrequency(&freq) == 0) {
			return FALSE;
		}
		freqInitialized = TRUE;
	}
	BOOL rc = QueryPerformanceCounter(pcount);
	return rc != 0;
}
static uint64 CalculateDuration(LARGE_INTEGER start, LARGE_INTEGER finish) {
	if (!freqInitialized) return 0L;
	LARGE_INTEGER elapsedMilliseconds;
	elapsedMilliseconds.QuadPart = finish.QuadPart - start.QuadPart;
	elapsedMilliseconds.QuadPart *= 1000;
	elapsedMilliseconds.QuadPart /= freq.QuadPart;
	return static_cast<uint64>(elapsedMilliseconds.QuadPart);
}
static unsigned long long GetRealTime() {
	SYSTEMTIME st;
	GetSystemTime(&st);
	return std::time(NULL) * 1000 + st.wMilliseconds;
}
#endif

void beforeGC(GCType type, GCCallbackFlags flags) {
	plugin::timingOK = GetSteadyTime(&plugin::gcSteadyStart);
}

void afterGC(GCType type, GCCallbackFlags flags) {
	unsigned long long gcRealEnd;
	
	// GC pause time
	if (plugin::timingOK) {
		plugin::timingOK = GetSteadyTime(&plugin::gcSteadyEnd);	
	}
	const uint64 gcDuration = plugin::timingOK ? CalculateDuration(plugin::gcSteadyStart, plugin::gcSteadyEnd) : 0; 

	// Get "real" time
	gcRealEnd = GetRealTime();

	// GC type
	const char *gcType = (type == kGCTypeMarkSweepCompact) ? "M" : "S";

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
	    plugin::api.logMessage(debug, "[gc_node] Registering push sources");
	
	    pushsource *head = createPushSource(0, "gc_node");
	    plugin::provid = provID;
	    return head;
	}
	
	NODEGCPLUGIN_DECL int ibmras_monitoring_plugin_init(const char* properties) {
		return 0;
	}
	
	NODEGCPLUGIN_DECL int ibmras_monitoring_plugin_start() {
		plugin::api.logMessage(fine, "[gc_node] Starting");
	
		V8::AddGCPrologueCallback(beforeGC);
		V8::AddGCEpilogueCallback(afterGC);
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
