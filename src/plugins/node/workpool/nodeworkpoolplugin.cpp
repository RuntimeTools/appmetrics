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

#include <cstring>
#include <sstream>
#include <string>
#include "Typesdef.h"
#include "ibmras/monitoring/AgentExtensions.h"
#include "uv.h"

#if defined(_WINDOWS)
#define NODELOOPPLUGIN_DECL __declspec(dllexport)
#else
#define NODELOOPPLUGIN_DECL
#endif

static const uint32 DEFAULT_CAPACITY = 10240;
static const uint32 REPORT_INTERVAL = 5000; // same as eventloop metrics
static const loggingLevel DEBUG = loggingLevel::debug;
static agentCoreFunctions api;
static uint32 provID;

uv_mutex_t mutex;
static int32_t submitted;
static int32_t completed;
static int32_t queued;
static int32_t idle_threads;

void StartCb(int queued_, int idle_threads_, void* data) {
  uv_mutex_lock(&mutex);
  queued = queued_;
  idle_threads = idle_threads_;
  uv_mutex_unlock(&mutex);
}

void SubmitCb(int queued_, int idle_threads_, void* data) {
  uv_mutex_lock(&mutex);
  submitted++;
  queued = queued_;
  idle_threads = idle_threads_;
  uv_mutex_unlock(&mutex);
}

void DoneCb(int queued_, int idle_threads_, void* data) {
  uv_mutex_lock(&mutex);
  completed++;
  queued = queued_;
  idle_threads = idle_threads_;
  uv_mutex_unlock(&mutex);
}

static uv_queue_stats_t stats_handle;

static uv_timer_t timer_handle;
static void ReportCb(uv_timer_t *data_) {
  std::stringstream contentss;
  contentss << "NodeWorkPoolData";
  contentss << "," << submitted; // in last interval
  contentss << "," << completed; // in last interval
  contentss << "," << queued; // last value
  // Could be max/min/cur, but since queued is already essentially an
  // accumulator, perhaps sampling it is fine.
  contentss << "," << idle_threads; // last value
  contentss << '\n';

  std::string content = contentss.str();

  submitted = 0;
  completed = 0;
  queued = 0;
  idle_threads = 0;

  monitordata mdata;
  mdata.persistent = false;
  mdata.provID = provID;
  mdata.sourceID = 0;
  mdata.size = static_cast<uint32>(content.length());
  mdata.data = content.c_str();
  api.agentPushData(&mdata);
}

static char* NewCString(const std::string& s) {
  char *result = new char[s.length() + 1];
  std::strcpy(result, s.c_str());
  return result;
}

pushsource* createPushSource(uint32 sourceID, const char* name) {
  pushsource *src = new pushsource();
  src->header.name = name;
  std::string desc("Description for ");
  desc.append(name);
  src->header.description = NewCString(desc);
  src->header.sourceID = sourceID;
  src->next = NULL;
  src->header.capacity = DEFAULT_CAPACITY;
  return src;
}

extern "C" {
  NODELOOPPLUGIN_DECL pushsource* ibmras_monitoring_registerPushSource(
      agentCoreFunctions api_, uint32 provID_) {
    api = api_;
    provID = provID_;
    api.logMessage(DEBUG, "[workpool_node] Registering push sources");
    pushsource *head = createPushSource(0, "workpool_node");
    return head;
  }

  NODELOOPPLUGIN_DECL int ibmras_monitoring_plugin_init(const char* properties) {
    uv_mutex_init(&mutex);
    uv_timer_init(uv_default_loop(), &timer_handle);
    uv_unref((uv_handle_t*) &timer_handle); // don't prevent event loop exit
    stats_handle.submit_cb = SubmitCb;
    stats_handle.start_cb = StartCb;
    stats_handle.done_cb = DoneCb;
    return 0;
  }

  NODELOOPPLUGIN_DECL int ibmras_monitoring_plugin_start() {
    api.logMessage(fine, "[workpool_node] Starting"); // XXX fine?

    uv_timer_start(&timer_handle, ReportCb, REPORT_INTERVAL, REPORT_INTERVAL);
    uv_queue_stats_start(&stats_handle);

    return 0;
  }

  NODELOOPPLUGIN_DECL int ibmras_monitoring_plugin_stop() {
    api.logMessage(fine, "[workpool_node] Stopping"); // XXX fine?

    uv_timer_stop(&timer_handle);
    uv_queue_stats_stop(&stats_handle);

    return 0;
  }

  NODELOOPPLUGIN_DECL const char* ibmras_monitoring_getVersion() {
    return "1.0";
  }
}
