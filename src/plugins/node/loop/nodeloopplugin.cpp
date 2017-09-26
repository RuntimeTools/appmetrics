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
#include <sys/resource.h>
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

uint64_t last_cpu_user = 0;
uint64_t last_cpu_sys = 0;
uint64_t last_cpu_ts = 0;

void getThreadCPUTime(uint64_t* cpu_user, uint64_t* cpu_sys) {
	// Get the CPU time for this thread
#ifdef RUSAGE_THREAD
	struct rusage stats;
	if (getrusage(RUSAGE_THREAD, &stats) == 0) {
#if defined(__APPLE__) || defined(_AIX)
		*cpu_user = (uint64_t)(stats.ru_utime.tv_sec * 1000) + (uint64_t)(stats.ru_utime.tv_usec / 1000);
		*cpu_sys = (uint64_t)(stats.ru_stime.tv_sec * 1000) + (uint64_t)(stats.ru_stime.tv_usec / 1000);
#else
		*cpu_user = (uint64_t)(stats.ru_utime.tv_sec * 1000) + (uint64_t)(stats.ru_utime.tv_usec / 1000);
		*cpu_sys = (uint64_t)(stats.ru_stime.tv_sec * 1000) + (uint64_t)(stats.ru_stime.tv_usec / 1000);
#endif
	}
#elif defined(__APPLE__)
	mach_msg_type_number_t count = THREAD_BASIC_INFO_COUNT;
	mach_port_t thread = pthread_mach_thread_np(pthread_self());
	thread_basic_info thr_info;

	kern_return_t rc = thread_info(thread, THREAD_BASIC_INFO,
			(thread_info_t) &thr_info, &count);

	if (rc == KERN_SUCCESS) {
		*cpu_user = (thr_info.user_time.seconds * 1000) + (thr_info.user_time.microseconds / 1000);
		*cpu_sys = (thr_info.system_time.seconds * 1000) + (thr_info.system_time.microseconds / 1000);
	}
#else
	*cpu_user = 0;
	*cpu_sys = 0;
#endif
}

#if NODE_VERSION_AT_LEAST(0, 11, 0) // > v0.11+
static void GetLoopInformation(uv_timer_s *data) {
#else
static void GetLoopInformation(uv_timer_s *data, int status) {
#endif
	if (num != 0) {

	  uint64_t cpu_user = 0;
	  uint64_t cpu_sys = 0;
	  uint64_t cpu_ts = uv_hrtime() / (1000*1000);
	  getThreadCPUTime(&cpu_user, &cpu_sys);

	  // Convert from nanoseconds to milliseconds.

	  double mean = (sum / 1e6) / num;
	  double cpu_duration = (double)(cpu_ts - last_cpu_ts);

	  std::stringstream contentss;
	  contentss << "NodeLoopData";
	  contentss << "," << (min / 1e6);
	  contentss << "," << (max / 1e6);
	  contentss << "," << num;
	  contentss << "," << mean;
	  contentss << "," << (double)(((double)(cpu_user - last_cpu_user)) / cpu_duration);
	  contentss << "," << (double)(((double)(cpu_sys - last_cpu_sys)) / cpu_duration);
	  contentss << '\n';

	  std::string content = contentss.str();

	  min = UINT64_MAX;
	  max = 0;
	  num = 0;
	  sum = 0;
	  last_cpu_user = cpu_user;
	  last_cpu_sys = cpu_sys;
	  last_cpu_ts = cpu_ts;


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

		plugin::timer = new uv_timer_t;
		uv_timer_init(uv_default_loop(), plugin::timer);
		uv_unref((uv_handle_t*) plugin::timer); // don't prevent event loop exit

		return 0;
	}

	NODELOOPPLUGIN_DECL int ibmras_monitoring_plugin_start() {
		plugin::api.logMessage(fine, "[loop_node] Starting");

		last_cpu_ts = uv_hrtime() / (1000*1000);
		getThreadCPUTime(&last_cpu_user, &last_cpu_sys);

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
