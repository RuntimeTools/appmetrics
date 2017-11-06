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

#define Megabytes(V) ((V) * 1024 * 1024)

#if V8_HOST_ARCH_PPC && V8_TARGET_ARCH_PPC && V8_OS_LINUX
#define HEAP_PAGE_SIZE 4
#else
#define HEAP_PAGE_SIZE 1
#endif

#include "ibmras/monitoring/AgentExtensions.h"
#include "Typesdef.h"
#include "uv.h"
#include "v8.h"
#include "nan.h"
#include <cstdlib>
#include <cstring>
#include <string>
#include <sstream>

#if defined(_ZOS)
#include <unistd.h>
#endif

#define DEFAULT_CAPACITY 1024

#if defined(_WINDOWS)
#define NODEENVPLUGIN_DECL __declspec(dllexport)	/* required for DLLs to export the plugin functions */
#else
#define NODEENVPLUGIN_DECL
#endif

namespace plugin {
	agentCoreFunctions api;
	uint32 provid = 0;

	std::string nodeVersion;
	std::string nodeTag;
	std::string nodeVendor;
	std::string nodeName;
	std::string commandLineArguments;
	size_t maxOldSpaceSizeGuess;
	size_t maxSemiSpaceSizeGuess;
	size_t maxHeapSizeGuess;
	size_t heapSizeLimit;
}

using namespace v8;

static char* NewCString(const std::string& s) {
	char *result = new char[s.length() + 1];
	std::strcpy(result, s.c_str());
	return result;
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

static std::string ToStdString(Local<String> s) {
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

static Local<Object> GetProcessObject() {
	return Nan::GetCurrentContext()->Global()->Get(Nan::New<String>(asciiString("process")).ToLocalChecked())->ToObject();
}

static Local<Object> GetProcessConfigObject() {
	return Nan::GetCurrentContext()->Global()->Get(Nan::New<String>(asciiString("process")).ToLocalChecked())->ToObject()->Get(Nan::New<String>(asciiString("config")).ToLocalChecked())->ToObject();

}

static std::string GetNodeVersion() {
	Local<String> version = GetProcessObject()->Get(Nan::New<String>(asciiString("version")).ToLocalChecked())->ToString();
	return ToStdString(version);
}

static std::string GetNodeTag() {
	Local<String> tag = GetProcessConfigObject()->Get(Nan::New<String>(asciiString("variables")).ToLocalChecked())->ToObject()->Get(Nan::New<String>(asciiString("node_tag")).ToLocalChecked())->ToString();
	return ToStdString(tag);
}

static std::string GetNodeArguments(const std::string separator="@@@") {
	std::stringstream ss;
	Local<Object> process = GetProcessObject();
	Local<Object> nodeArgv = process->Get(Nan::New<String>(asciiString("execArgv")).ToLocalChecked())->ToObject();
	int64 nodeArgc = nodeArgv->Get(Nan::New<String>(asciiString("length")).ToLocalChecked())->ToInteger()->Value();

	int written = 0;
	if (nodeArgc > 0) {
		for (int i = 0; i < nodeArgc; i++) {
			if (written++ > 0) ss << separator;
			ss << ToStdString(nodeArgv->Get(i)->ToString());
		}
	}

	return ss.str();
}

static void cleanupHandle(uv_handle_t *handle) {
	delete handle;
}

size_t GuessSpaceSizeFromArgs(std::string argName) {
	size_t result = 0;

	Local<Object> process = GetProcessObject();
	Local<Object> nodeArgv = process->Get(Nan::New<String>(asciiString("execArgv")).ToLocalChecked())->ToObject();
	int64 nodeArgc = nodeArgv->Get(Nan::New<String>(asciiString("length")).ToLocalChecked())->ToInteger()->Value();

	for (int i = 0; i < nodeArgc; i++) {
		std::string arg = ToStdString(nodeArgv->Get(i)->ToString());
		if (arg.length() > argName.length()) {
			if (arg[0] == '-' && arg[1] == '-') {
				unsigned int idx;
				for (idx=2; idx < argName.length() && idx < arg.length(); idx++) {
					if (argName[idx] != arg[idx]) {
						if (!(argName[idx] == '-' && arg[idx] == '_')) {
							break;
						}
					}
				}
				if (idx == argName.length()) {
					// match
					result = Megabytes(strtol(arg.c_str() + idx, NULL, 10));
				}
			}
		}
	}
	return result;
}

static size_t GuessDefaultMaxOldSpaceSize() {
	return Megabytes(700ul * (v8::internal::kApiPointerSize / 4));
}

static size_t GuessDefaultMaxSemiSpaceSize() {
	return Megabytes(8ul * (v8::internal::kApiPointerSize / 4));
}

static size_t Align(size_t value, int alignment) {
	size_t result = value;
	if (value % alignment != 0) {
		result = (1 + (value / alignment)) * alignment;
	}
	return result;
}

static size_t AlignToPowerOfTwo(size_t value) {
	size_t result = value - 1;
	result = result | (result >> 1);
	result = result | (result >> 2);
	result = result | (result >> 4);
	result = result | (result >> 8);
	result = result | (result >> 16);
	if (sizeof(size_t) == 8) {
		result = result | (result >> 32);
	}
	// We are assuming here that size_t is 64-bit at maximum
	return result + 1;
}

static size_t GuessMaxOldSpaceSize() {
	size_t result = GuessSpaceSizeFromArgs("--max-old-space-size=");
	if (result <= 0) {
		result = GuessDefaultMaxOldSpaceSize();
	}
	if (result <= 0) {
		result = 0;
	} else {
		result = Align(result, Megabytes(HEAP_PAGE_SIZE));
	}
	return result;
}

static size_t GuessMaxSemiSpaceSize() {
	size_t result = GuessSpaceSizeFromArgs("--max-semi-space-size=");
	if (result <= 0) {
		result = GuessDefaultMaxSemiSpaceSize();
	}
	if (result <= 0) {
		result = 0;
	} else {
		result = AlignToPowerOfTwo(Align(result, Megabytes(HEAP_PAGE_SIZE)));
	}
	return result;
}

#if NODE_VERSION_AT_LEAST(0, 11, 0) // > v0.11+
static void GetNodeInformation(uv_async_t *async) {
#else
static void GetNodeInformation(uv_async_t *async, int status) {
#endif

	Nan::HandleScope scope;
	plugin::nodeVersion = GetNodeVersion();
	plugin::nodeTag = GetNodeTag();
	if (plugin::nodeTag.find("IBMBuild") != std::string::npos) {
		plugin::nodeVendor = std::string("IBM");
		plugin::nodeName = std::string("IBM SDK for Node.js");
	} else {
		plugin::nodeName = std::string("Node.js");
	}
	plugin::commandLineArguments = GetNodeArguments();
	plugin::maxOldSpaceSizeGuess = GuessMaxOldSpaceSize();
	plugin::maxSemiSpaceSizeGuess = GuessMaxSemiSpaceSize();
	plugin::maxHeapSizeGuess = 2 * plugin::maxSemiSpaceSizeGuess + plugin::maxOldSpaceSizeGuess;
	HeapStatistics hs;
	Nan::GetHeapStatistics(&hs);
	plugin::heapSizeLimit = hs.heap_size_limit();
	uv_close((uv_handle_t*) async, cleanupHandle);

	if (plugin::nodeVersion != "") {
		std::stringstream contentss;
		contentss << "#EnvironmentSource\n";

		contentss << "runtime.version=" << plugin::nodeVersion;
		if (plugin::nodeTag != "") {
			contentss << plugin::nodeTag;
		}
		contentss << '\n';

		contentss << "appmetrics.version=" << nativeString(std::string(plugin::api.getProperty("appmetrics.version"))) << '\n'; // eg "1.0.4"
		contentss << "agentcore.version=" << nativeString(std::string(plugin::api.getProperty("agent.version"))) << '\n'; // eg "3.0.7"

		if (plugin::nodeVendor != "") {
			contentss << "runtime.vendor=" << plugin::nodeVendor << '\n';
		}
		if (plugin::nodeName != "") {
			contentss << "runtime.name=" << plugin::nodeName << '\n';
		}

    // Cast the next 4 integers to uint64_t to work around a bug pushing uint32_t into stringstreams on Windows7/Node.js 7.7.3+
		contentss << "heap.size.limit=" << static_cast<uint64_t>(plugin::heapSizeLimit) << '\n';
		if (plugin::maxSemiSpaceSizeGuess > 0) {
			contentss << "max.semi.space.size=" << static_cast<uint64_t>(plugin::maxSemiSpaceSizeGuess) << '\n';
		}
		if (plugin::maxOldSpaceSizeGuess > 0) {
			contentss << "max.old.space.size=" << static_cast<uint64_t>(plugin::maxOldSpaceSizeGuess) << '\n';
		}
		if (plugin::maxHeapSizeGuess > 0) {
			contentss << "max.heap.size=" << static_cast<uint64_t>(plugin::maxHeapSizeGuess) << '\n';
		}


		contentss << "command.line.arguments=" << plugin::commandLineArguments << '\n';

		std::string content = contentss.str();
		monitordata data;
		data.persistent = false;
		data.provID = plugin::provid;
		data.sourceID = 0;
		data.size = static_cast<uint32>(content.length()); // should data->size be a size_t?
		data.data = content.c_str();
		plugin::api.agentPushData(&data);
	} else {
		plugin::api.logMessage(loggingLevel::debug, "[environment_node] Unable to get Node.js environment information");
	}

}

extern "C" {
	NODEENVPLUGIN_DECL pushsource* ibmras_monitoring_registerPushSource(agentCoreFunctions api, uint32 provID) {
		plugin::api = api;
		plugin::api.logMessage(loggingLevel::debug, "[environment_node] Registering push sources");

		pushsource *head = createPushSource(0, "environment_node");
		plugin::provid = provID;
		return head;
	}

	NODEENVPLUGIN_DECL int ibmras_monitoring_plugin_init(const char* properties) {
		return 0;
	}

	NODEENVPLUGIN_DECL int ibmras_monitoring_plugin_start() {
		plugin::api.logMessage(fine, "[environment_node] Starting");

		// Run GetNodeInformation() on the Node event loop
		uv_async_t *async = new uv_async_t;
		uv_async_init(uv_default_loop(), async, GetNodeInformation);
		uv_async_send(async); // close and cleanup in call back
		return 0;
	}

	NODEENVPLUGIN_DECL int ibmras_monitoring_plugin_stop() {
		plugin::api.logMessage(fine, "[environment_node] Stopping");
		return 0;
	}

	NODEENVPLUGIN_DECL const char* ibmras_monitoring_getVersion() {
		return "1.0";
	}
}
