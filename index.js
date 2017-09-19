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
'use strict';
var path = require('path');
var main_filename = require.main != null ? require.main.filename : '';
var module_dir = path.dirname(module.filename);
var aspect = require('./lib/aspect.js');
var request = require('./lib/request.js');
var fs = require('fs');
var agent = require('./appmetrics');
const os = require('os');
var notOnZOS = !(process.platform === 'os390');
if (notOnZOS) {
  var headlessZip = require('./headless_zip.js');
  var heapdump = require('./heapdump.js');
}
var VERSION = require('./package.json').version;
var assert = require('assert');
// Set the plugin search path
agent.spath(path.join(module_dir, 'plugins'));

// Edit LIBPATH on AIX to enable libagentcore to be loaded
if (process.platform == 'aix') process.env.LIBPATH = module_dir + ':' + process.env.LIBPATH;

var hcAPI = require('./appmetrics-api.js');
var jsonProfilingMode = false;
var propertyMappings = {
  mqttPort: 'com.ibm.diagnostics.healthcenter.mqtt.broker.port',
  mqttHost: 'com.ibm.diagnostics.healthcenter.mqtt.broker.host',
  applicationID: 'com.ibm.diagnostics.healthcenter.mqtt.application.id',
  mqtt: 'com.ibm.diagnostics.healthcenter.mqtt',
  profiling: 'com.ibm.diagnostics.healthcenter.data.profiling',
};

if (notOnZOS) {
  var headlessPropertyMappings = {
    'appmetrics.file.collection': 'com.ibm.diagnostics.healthcenter.headless',
    'appmetrics.file.max.size': 'com.ibm.diagnostics.healthcenter.headless.files.max.size',
    'appmetrics.file.run.duration': 'com.ibm.diagnostics.healthcenter.headless.run.duration',
    'appmetrics.file.delay.start': 'com.ibm.diagnostics.healthcenter.headless.delay.start',
    'appmetrics.file.run.pause.duration': 'com.ibm.diagnostics.healthcenter.headless.run.pause.duration',
    'appmetrics.file.run.number.of.runs': 'com.ibm.diagnostics.healthcenter.headless.run.number.of.runs',
    'appmetrics.file.files.to.keep': 'com.ibm.diagnostics.healthcenter.headless.files.to.keep',
    'appmetrics.file.output.directory': 'com.ibm.diagnostics.healthcenter.headless.output.directory',
  };
}
/*
 * Load module probes into probes array by searching the probes directory.
 * We handle the 'trace' probe as a special case because we don't want to put
 * the probe hooks in by default due to the performance cost.
 */
var probes = [];
var traceProbe;

var dirPath = path.join(__dirname, 'probes');
var files = fs.readdirSync(dirPath);
files.forEach(function(fileName) {
  var file = path.join(dirPath, fileName);
  var probeModule = new (require(file))();
  if (probeModule.name === 'trace') {
    traceProbe = probeModule;
  } else {
    probes.push(probeModule);
  }
});

var latencyData = {
  count: 0,
  min: 1 * 60 * 1000,
  max: 0,
  total: 0,
};

var latencyCheck = function() {
  var start = process.hrtime();
  setImmediate(function(start) {
    var delta = process.hrtime(start);
    var latency = delta[0] * 1000 + delta[1] / 1000000;
    latencyData.count++;
    latencyData.min = Math.min(latencyData.min, latency);
    latencyData.max = Math.max(latencyData.max, latency);
    latencyData.total = latencyData.total + latency;
  }, start);
};

var latencyReport = function() {
  if (latencyData.count == 0) return;
  var latency = {
    min: latencyData.min,
    max: latencyData.max,
    avg: latencyData.total / latencyData.count,
  };
  module.exports.emit('eventloop', { time: Date.now(), latency: latency });
  latencyData.count = 0;
  latencyData.min = 1 * 60 * 1000;
  latencyData.max = 0;
  latencyData.total = 0;
};

var latencyCheckInterval = 500;
var latencyReportInterval = 5000;
var latencyRunning = true;
var latencyCheckLoop = setInterval(latencyCheck, latencyCheckInterval);
var latencyReportLoop = setInterval(latencyReport, latencyReportInterval);
latencyCheckLoop.unref();
latencyReportLoop.unref();

if (global.Appmetrics) {
  assert(
    global.Appmetrics.VERSION === VERSION,
    'Multiple versions of Node Application Metrics are being initialized.\n' +
      'This version ' +
      VERSION +
      ' is incompatible with already initialized\n' +
      'version ' +
      global.Appmetrics.VERSION +
      '.\n'
  );
  exports = module.exports = global.Appmetrics;
} else {
  global.Appmetrics = module.exports;
  module.exports.VERSION = VERSION;
}

/*
 * Patch the module require function to run the probe attach function
 * for any matching module. This loads the monitoring probes into the modules
 */
var data = {};

/* eslint no-proto:0 */
aspect.after(module.__proto__, 'require', data, function(obj, methodName, args, context, ret) {
  if (ret == null || ret.__ddProbeAttached__) {
    return ret;
  } else {
    for (var i = 0; i < probes.length; i++) {
      if (probes[i].name === args[0]) {
        ret = probes[i].attach(args[0], ret, module.exports);
      }
      if (probes[i].name === 'trace') {
        ret = probes[i].attach(args[0], ret);
      }
    }
    return ret;
  }
});

if (notOnZOS) {
  agent.setHeadlessZipFunction(headlessZip.headlessZip);
}

// Export any functions exported by the agent
for (var prop in agent) {
  if (typeof agent[prop] == 'function') {
    module.exports[prop] = agent[prop];
  }
}

/*
 * Provide API to enable data collection for a given data type.
 * Profiling is done via a control message to the core monitoring agent.
 * Requests require asking all probes to enable request events
 * Other requests are passed to any probe matching the name
 */
module.exports.enable = function(data, config) {
  switch (data) {
    case 'profiling':
      agent.sendControlCommand('profiling_node', 'on,profiling_node_subsystem');
      break;
    case 'requests':
      probes.forEach(function(probe) {
        probe.enableRequests();
      });
      break;
    case 'trace':
      if (probes.indexOf(traceProbe) === -1) {
        probes.push(traceProbe);
      }
      traceProbe.enable();
      break;
    case 'eventloop':
      if (latencyRunning === true) break;
      latencyRunning = true;
      latencyCheckLoop = setInterval(latencyCheck, latencyCheckInterval);
      latencyReportLoop = setInterval(latencyReport, latencyReportInterval);
      break;
    default:
      probes.forEach(function(probe) {
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
module.exports.disable = function(data) {
  switch (data) {
    case 'profiling':
      agent.sendControlCommand('profiling_node', 'off,profiling_node_subsystem');
      break;
    case 'requests':
      probes.forEach(function(probe) {
        probe.disableRequests();
      });
      break;
    case 'eventloop':
      if (latencyRunning === false) break;
      latencyRunning = false;
      clearInterval(latencyCheckLoop);
      clearInterval(latencyReportLoop);
      break;
    default:
      probes.forEach(function(probe) {
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
module.exports.setConfig = function(data, config) {
  switch (data) {
    case 'requests':
      request.setConfig(config);
      /* check for exclude modules and disable those to be excluded */
      if (typeof config.excludeModules !== 'undefined') {
        config.excludeModules.forEach(function(module) {
          probes.forEach(function(probe) {
            if (probe.name === module) {
              probe.disableRequests();
            }
          });
        });
      }
      break;
    case 'advancedProfiling':
      if (typeof config.threshold !== 'undefined')
        agent.sendControlCommand('profiling_node', config.threshold + ',profiling_node_threshold');
      break;
    default:
      probes.forEach(function(probe) {
        if (probe.name == data) {
          probe.setConfig(config);
        }
      });
  }
};

// Export emit() API for JS data providers
module.exports.emit = function(topic, data) {
  if (typeof this.api !== 'undefined') {
    // We have a listener, so fast path the notification to them
    this.api.raiseLocalEvent(topic, data);
  }
  // Publish data that can be visualised in Health Center
  if (topic == 'http' || topic == 'mqlight' || topic == 'mongo' || topic == 'mysql') {
    data = JSON.stringify(data);
    agent.nativeEmit(topic, String(data));
  }
};

// Export monitor() API for consuming data in-process
module.exports.monitor = function() {
  if (typeof this.api == 'undefined') {
    this.start();
    this.api = hcAPI.getAPI(agent, module.exports);
  }
  return this.api;
};

module.exports.lrtime = agent.lrtime;

module.exports.configure = function(options) {
  options = options || {};
  this.strongTracerInstrument = options.strongTracer ? options.strongTracer.tracer : null;
  for (var key in options) {
    if (propertyMappings[key]) {
      agent.setOption(propertyMappings[key], options[key]);
    } else {
      agent.setOption(key, options[key]);
    }
  }

  // If user has not specified application ID, use main filename
  main_filename = options.applicationID ? options.applicationID : main_filename;
};

module.exports.transactionLink = function(linkName, callback) {
  if (!this.strongTracerInstrument) return callback;
  return this.strongTracerInstrument.transactionLink(linkName, callback);
};

module.exports.setJSONProfilingMode = function(val) {
  jsonProfilingMode = val;
};

module.exports.getJSONProfilingMode = function() {
  return jsonProfilingMode;
};

module.exports.getTotalPhysicalMemorySize = function() {
  return os.totalmem();
};

if (notOnZOS) {
  module.exports.writeSnapshot = function(args) {
    return heapdump.writeSnapshot(args);
  };
}

module.exports.start = function start() {
  agent.setOption(propertyMappings['applicationID'], main_filename);
  if (notOnZOS) {
    for (var property in headlessPropertyMappings) {
      var prop = agent.getOption(property);
      if (prop) {
        agent.setOption(headlessPropertyMappings[property], prop);
      }
    }
    var headlessOutputDir = agent.getOption('com.ibm.diagnostics.healthcenter.headless.output.directory');
    if (headlessOutputDir) {
      headlessZip.setHeadlessOutputDir(headlessOutputDir);
    }
    var headlessFilesToKeep = agent.getOption('com.ibm.diagnostics.healthcenter.headless.files.to.keep');
    if (headlessFilesToKeep && !isNaN(headlessFilesToKeep) && headlessFilesToKeep > 0) {
      headlessZip.setFilesToKeep(headlessFilesToKeep);
    }
  }
  var am = this;
  agent.start();
  process.on('exit', function() {
    // take the event loop latency methods off the loop
    if (latencyRunning === true) {
      clearInterval(latencyCheckLoop);
      clearInterval(latencyReportLoop);
    }
    if (notOnZOS) {
      var headlessMode = agent.getOption('com.ibm.diagnostics.healthcenter.headless');
    }
    am.stop();
    if (notOnZOS && headlessMode == 'on') {
      headlessZip.tryZipOnExit();
    }
  });

  // Start the probes
  probes.forEach(function(probe) {
    probe.start();
  });

  return this;
};
