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
#define NODELOOPPLUGIN_DECL __declspec(dllexport)	/* required for DLLs to export the plugin functions */
#else
#define NODELOOPPLUGIN_DECL
#endif

#define LOOP_INTERVAL 5000 // Same as `eventloop` metric
namespace plugin {
	agentCoreFunctions api;
	uint32 provid = 0;
    uv_timer_t *timer;
}

using namespace v8;

static char* NewCString(const std::string& s) {
	char *result = new char[s.length() + 1];
	std::strcpy(result, s.c_str());
	return result;
}

uv_prepare_t prepare_handle;
uv_check_t check_handle;
uint64_t tick_start;
uint64_t min = UINT64_MAX;
uint64_t max = 0;
uint64_t num = 0;
uint64_t sum = 0;


#if NODE_VERSION_AT_LEAST(0, 11, 0) // > v0.11+
static void GetLoopInformation(uv_timer_t *data) {
#else
static void GetLoopInformation(uv_timer_t *data, int status) {
#endif
	if (num != 0) {
          // Convert from nanoseconds to milliseconds.

	  double mean = (sum / 1e6) / num;

	  std::stringstream contentss;
	  contentss << "NodeLoopData";
	  contentss << "," << (min / 1e6);
	  contentss << "," << (max / 1e6);
	  contentss << "," << num;
	  contentss << "," << mean;
	  contentss << '\n';

	  std::string content = contentss.str();

	  min = UINT64_MAX;
	  max = 0;
	  num = 0;
	  sum = 0;


	  // Send data
	  monitordata mdata;
	  mdata.persistent = false;
	  mdata.provID = plugin::provid;
	  mdata.sourceID = 0;
	  mdata.size = static_cast<uint32>(content.length());
	  mdata.data = content.c_str();
	  plugin::api.agentPushData(&mdata);
  }

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

void OnCheck(uv_check_t* handle) {
        tick_start = uv_hrtime();
}

void OnPrepare(uv_prepare_t* handle) {
        if (!tick_start) return;

        const uint64_t tick_end = uv_hrtime();
        if (tick_end < tick_start) {
                // Should not happen, but ignore, next check will reset
                // the start time.
                return;
        }
        const double delta = tick_end - tick_start;

	if (delta < min) {
		min = delta;
	}
	if (delta > max) {
		max = delta;
	}
	num += 1;
	sum += delta;
}

extern "C" {
	NODELOOPPLUGIN_DECL pushsource* ibmras_monitoring_registerPushSource(agentCoreFunctions api, uint32 provID) {
	    plugin::api = api;
	    plugin::api.logMessage(loggingLevel::debug, "[loop_node] Registering push sources");

	    pushsource *head = createPushSource(0, "loop_node");
	    plugin::provid = provID;
	    return head;
	}

	NODELOOPPLUGIN_DECL int ibmras_monitoring_plugin_init(const char* properties) {
		uv_prepare_init(uv_default_loop(), &prepare_handle);
		uv_unref(reinterpret_cast<uv_handle_t*>(&prepare_handle));
		uv_check_init(uv_default_loop(), &check_handle);
		uv_unref(reinterpret_cast<uv_handle_t*>(&check_handle));

		plugin::timer = new uv_timer_t; // why dynamic allocation?
		uv_timer_init(uv_default_loop(), plugin::timer);
		uv_unref((uv_handle_t*) plugin::timer); // don't prevent event loop exit

		return 0;
	}

	NODELOOPPLUGIN_DECL int ibmras_monitoring_plugin_start() {
		plugin::api.logMessage(fine, "[loop_node] Starting");

		uv_prepare_start(&prepare_handle, OnPrepare);
		uv_check_start(&check_handle, OnCheck);
		uv_timer_start(plugin::timer, GetLoopInformation, LOOP_INTERVAL, LOOP_INTERVAL);

		return 0;
	}

	NODELOOPPLUGIN_DECL int ibmras_monitoring_plugin_stop() {
		plugin::api.logMessage(fine, "[loop_node] Stopping");

		uv_timer_stop(plugin::timer);
		uv_prepare_stop(&prepare_handle);
		uv_check_stop(&check_handle);

		return 0;
	}

	NODELOOPPLUGIN_DECL const char* ibmras_monitoring_getVersion() {
		return "1.0";
	}
}
