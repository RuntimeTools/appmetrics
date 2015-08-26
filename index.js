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
var serializer = require('./lib/serializer.js');
var aspect = require('./lib/aspect.js');
var request = require('./lib/request.js');
var fs = require('fs');

var agent = require("./appmetrics")
// Set the plugin search path
agent.spath(path.join(module_dir, "plugins"))
agent.start();

var hcAPI = require("./appmetrics-api.js");

/*
 * Load module probes into probes array by searching the probes directory.
 * We handle the 'trace' probe as a special case because we don't want to put
 * the probe hooks in by default due to the performance cost.
 */
var probes = [];
var traceProbe;
	
var dirPath = path.join(__dirname, 'probes'); 
var files = fs.readdirSync(dirPath);
files.forEach(function (fileName) {
	var file = path.join(dirPath, fileName);
	var probeModule = new (require(file))();
	if (probeModule.name === 'trace') {
		traceProbe = probeModule;
	} else {
		probes.push(probeModule);					
	}
});

/*
 * Patch the module require function to run the probe attach function
 * for any matching module. This loads the monitoring probes into the modules
 */
aspect.after(module.__proto__, 'require', function(obj, args, ret) {
	for (var i = 0; i < probes.length; i++) {
		if (probes[i].name === args[0] || probes[i].name === 'trace') {
			probes[i].attach(args[0], ret, module.exports);
		}
	}
	return ret;
});

/*
 * Provide API to enable data collection for a given data type.
 * Profiling is done via a control message to the core monitoring agent.
 * Requests require asking all probes to enable request events
 * Other requests are passed to any probe matching the name
 */
module.exports.enable = function (data, config) {
	switch (data) {
		case 'profiling':
			agent.sendControlCommand("profiling_node", "on,profiling_node_subsystem");
			break;
		case 'requests':
			probes.forEach(function (probe) {
				probe.enableRequests();
			});
			break;
		case 'trace':
			if (probes.indexOf(traceProbe) === -1) {
				probes.push(traceProbe);
			}
			traceProbe.enable();
			break;
		default:
			probes.forEach(function (probe) {
				if (probe.name == data) {
					probe.enable();
				}
			});
	}
	if (config) module.exports.setConfig(data, config);
};

/*
 * Provide API to disable data collection for a given data type.
 * Profiling is done via a control message to the core monitoring agent.
 * Requests require asking all probes to disable request events
 * Other requests are passed to any probe matching the name
 */
module.exports.disable = function (data) {
	switch (data) {
	case 'profiling':
		agent.sendControlCommand("profiling_node", "off,profiling_node_subsystem");
		break;
	case 'requests':
		probes.forEach(function (probe) {
			probe.disableRequests();
		});
		break;
	default:
		probes.forEach(function (probe) {
			if (probe.name == data) {
				probe.disable();
			}
		});
	}
};

/*
 * Set the config for a type of data. These are passed through to the relevant
 * probes except in the case of 'requests'. Here we check for any excludeModules config,
 * and if present use that to control the relevant probes directly.
 */
module.exports.setConfig = function (data, config) {
	switch (data) {
	case 'requests':
		request.setConfig(config);
		/* check for exclude modules and disable those to be excluded */
		if (typeof(config.excludeModules) !== 'undefined') {
			config.excludeModules.forEach(function(module) {
				probes.forEach(function (probe) {
					if (probe.name === module) {
						probe.disableRequests();
					}
				});
			})
		}
		break;
	default:
		probes.forEach(function (probe) {
			if (probe.name == data) {
				probe.setConfig(config);
			}
		});
	}
};

// Export any functions exported by the agent
for (var prop in agent) {
    if (typeof agent[prop] == "function") {
        module.exports[prop] = agent[prop]
    }
}

// Export emit() API for JS data providers
module.exports.emit = function (topic, data) {
	data = serializer.serialize(data);
	agent.nativeEmit(topic, String(data));
};

// Export monitor() API for consuming data in-process
module.exports.monitor = function() {
	if (typeof(this.api) == 'undefined') {
		this.api = hcAPI.getAPI(agent, module.exports);
	}
	return this.api;
};
