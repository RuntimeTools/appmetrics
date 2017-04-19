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

#define LOOP_INTERVAL 60000
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

uv_check_t check_handle;
int32_t min = 9999;
int32_t max = 0;
int32_t num = 0;
int32_t sum = 0;


#if NODE_VERSION_AT_LEAST(0, 11, 0) // > v0.11+
static void GetLoopInformation(uv_timer_s *data) {
#else
static void GetLoopInformation(uv_timer_s *data, int status) {
#endif
	if (num != 0) {
	  double mean = 0;
		mean = sum / num;

	  std::stringstream contentss;
	  contentss << "NodeLoopData";
	  contentss << "," << min;
	  contentss << "," << max;
	  contentss << "," << num;
	  contentss << "," << mean;
	  contentss << '\n';

	  std::string content = contentss.str();

	  min = 9999;
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
	const uv_loop_t* const loop = handle->loop;
	const uint64_t now = uv_hrtime() / static_cast<uint64_t>(1e6);

	const int32_t delta = static_cast<int32_t>(
			now <= loop->time ? 0 : (now - loop->time));

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
	    plugin::api.logMessage(debug, "[loop_node] Registering push sources");

	    pushsource *head = createPushSource(0, "loop_node");
	    plugin::provid = provID;
	    return head;
	}

	NODELOOPPLUGIN_DECL int ibmras_monitoring_plugin_init(const char* properties) {
		uv_check_init(uv_default_loop(), &check_handle);
		uv_unref(reinterpret_cast<uv_handle_t*>(&check_handle));

		plugin::timer = new uv_timer_t;
		uv_timer_init(uv_default_loop(), plugin::timer);
		uv_unref((uv_handle_t*) plugin::timer); // don't prevent event loop exit

		return 0;
	}

	NODELOOPPLUGIN_DECL int ibmras_monitoring_plugin_start() {
		plugin::api.logMessage(fine, "[loop_node] Starting");

		uv_check_start(&check_handle, reinterpret_cast<uv_check_cb>(OnCheck));
		uv_timer_start(plugin::timer, GetLoopInformation, LOOP_INTERVAL, LOOP_INTERVAL);

		return 0;
	}

	NODELOOPPLUGIN_DECL int ibmras_monitoring_plugin_stop() {
		plugin::api.logMessage(fine, "[loop_node] Stopping");

		uv_timer_stop(plugin::timer);
		uv_check_stop(&check_handle);

		return 0;
	}

	NODELOOPPLUGIN_DECL const char* ibmras_monitoring_getVersion() {
		return "1.0";
	}
}
