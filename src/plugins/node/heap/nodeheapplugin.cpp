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

#include "ibmras/monitoring/AgentExtensions.h"
#include "Typesdef.h"
#include "v8.h"
#include "nan.h"
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
#define NODEHEAPPLUGIN_DECL __declspec(dllexport)	/* required for DLLs to export the plugin functions */
#else
#define NODEHEAPPLUGIN_DECL
#endif

#define HEAP_INTERVAL 6000
namespace plugin {
	agentCoreFunctions api;
	uint32 provid = 0;
	bool timingOK;
    uv_timer_t *timer;
}

using namespace v8;

static char* NewCString(const std::string& s) {
	char *result = new char[s.length() + 1];
	std::strcpy(result, s.c_str());
	return result;
}

static void cleanupHandle(uv_handle_t *handle) {
	delete handle;
}

#if NODE_VERSION_AT_LEAST(0, 11, 0) // > v0.11+
static void GetHeapInformation(uv_timer_s *data) {
#else
static void GetHeapInformation(uv_timer_s *data, int status) {
#endif

	// Heap stats
	HeapStatistics hs;

	Nan::GetHeapStatistics(&hs);

	std::stringstream contentss;
	contentss << "NodeHeapData";
	contentss << "," <<  static_cast<uint64_t>(hs.total_heap_size());
	contentss << "," <<  static_cast<uint64_t>(hs.used_heap_size());
	contentss << '\n';
	
	std::string content = contentss.str();

	// Send data
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
        std::string desc("Description for ");
        desc.append(name);
        src->header.description = NewCString(desc);
        src->header.sourceID = srcid;
        src->next = NULL;
        src->header.capacity = DEFAULT_CAPACITY;
        return src;
}

extern "C" {
	NODEHEAPPLUGIN_DECL pushsource* ibmras_monitoring_registerPushSource(agentCoreFunctions api, uint32 provID) {
	    plugin::api = api;
	    plugin::api.logMessage(loggingLevel::debug, "[heap_node] Registering push sources");
	
	    pushsource *head = createPushSource(0, "heap_node");
	    plugin::provid = provID;
	    return head;
	}
	
	NODEHEAPPLUGIN_DECL int ibmras_monitoring_plugin_init(const char* properties) {
		return 0;
	}
	
	NODEHEAPPLUGIN_DECL int ibmras_monitoring_plugin_start() {
		plugin::api.logMessage(fine, "[heap_node] Starting");

        plugin::timer = new uv_timer_t;
		uv_timer_init(uv_default_loop(), plugin::timer);
		uv_unref((uv_handle_t*) plugin::timer); // don't prevent event loop exit

        uv_timer_start(plugin::timer, GetHeapInformation, HEAP_INTERVAL, HEAP_INTERVAL);

        // Run GetHeapInformation() on the Node event loop
//        uv_async_t *async = new uv_async_t;
//       uv_async_init(uv_default_loop(), async, GetHeapInformation);
//        uv_async_send(async); // close and cleanup in call back
        return 0;
	}
	
	NODEHEAPPLUGIN_DECL int ibmras_monitoring_plugin_stop() {
		plugin::api.logMessage(fine, "[heap_node] Stopping");
        uv_timer_stop(plugin::timer);
		uv_close((uv_handle_t*) plugin::timer, cleanupHandle);
		return 0;
	}
	
	NODEHEAPPLUGIN_DECL const char* ibmras_monitoring_getVersion() {
		return "1.0";
	}
}
