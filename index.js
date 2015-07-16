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

var path = require("path")
var module_dir = path.dirname(module.filename)
var os = require("os")

var agent = require("./appmetrics")
// Set the plugin search path
agent.spath(path.join(module_dir, "plugins"))
agent.start();

var hcAPI = require("./appmetrics-api.js");

// Export any functions exported by the agent
for (var prop in agent) {
    if (typeof agent[prop] == "function") {
        module.exports[prop] = agent[prop]
    }
}

// Export emit() API for JS data providers
module.exports.emit = function (topic, data) {
	agent.nativeEmit(topic, JSON.stringify(data));
};

// Export monitor() API for consuming data in-process
module.exports.monitor = function() {
	if (typeof(this.api) == 'undefined') {
		this.api = hcAPI.getAPI(agent);
	}
	return this.api;
};
