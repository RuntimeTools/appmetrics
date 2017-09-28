/*******************************************************************************
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
/* eslint radix:0 */
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var serializer = require('./lib/serializer');

function API(agent, appmetrics) {
  this.appmetrics = appmetrics;
  this.agent = agent;
  this.environment = {};
  /*
     * We consider ourselves initialized when we have both OS and Runtime Env data
     * Decrement on when we get each, and raise 'initialized' event on 0;
     */
  this.initialized = 2;
  var that = this;

  var raiseEvent = function(topic, message) {
    if (typeof topic != 'string' || typeof message != 'string') {
      return;
    }
    switch (topic) {
      case 'common_cpu':
      case 'cpu':
        formatCPU(message);
        break;
      case 'common_env':
        formatOSEnv(message);
        break;
      case 'environment_node':
        formatRuntimeEnv(message);
        break;
      case 'common_memory':
      case 'memory':
      case 'memory_node':
        formatMemory(message);
        break;
      case 'gc_node':
        formatGC(message);
        break;
      case 'profiling_node':
        formatProfiling(message);
        break;
      case 'api':
        formatApi(message);
        break;
      case 'loop_node':
        formatLoop(message);
        break;
      default:
        // Just raise any unknown message as an event so someone can parse it themselves
        that.emit(topic, message);
    }
  };

  var formatCPU = function(message) {
    // cpu : startCPU@#1412609879696@#0.000499877@#0.137468
    var values = message.trim().split('@#'); // needs to be trimmed because of leading \n character
    var cpu = {
      time: parseInt(values[1]),
      process: parseFloat(values[2]),
      system: parseFloat(values[3]),
    };
    that.emit('cpu', cpu);
  };

  var formatOSEnv = function(message) {
    /* environment_os : #EnvironmentSource
           environment.LESSOPEN=| /usr/bin/lesspipe %s
           environment.GNOME_KEYRING_PID=1111
           environment.USER=exampleuser
           os.arch=x86_64
           os.name=Linux
           os.version=3.5.0-54-generic#81~precise1-Ubuntu SMP Tue Jul 15 04:02:22 UTC 2014
           pid=4838
           native.library.date=Oct 20 2014 10:51:56
           number.of.processors=2
           command.line=/home/exampleuser/sandbox/node-v0.10.32-linux-x64/bin/node /home/exampleuser/sandbox/node-v0.10.32-linux-x64/lib/node_modules/appmetrics/launcher.js red.js
         */
    var values = message.split('\n');
    var env = {};
    values.forEach(function(value) {
      if (value[0] != '#') {
        var terms = value.split('=');
        env[terms[0]] = terms[1];
      }
    });

    setEnv(env);
    that.initialized--;
    that.emit('environment', that.environment);
    if (that.initialized == 0) that.emit('initialized');
  };

  var setEnv = function(env) {
    for (var p in env) {
      that.environment[p] = env[p];
    }
  };

  var formatRuntimeEnv = function(message) {
    // environment_node : #EnvironmentSource
    // runtime.version=v0.10.32-IBMBuild-201410132030
    // runtime.vendor=IBM
    // runtime.name=IBM SDK for Node.js
    // command.line.arguments=
    // jar.version=3.0.0.20141020
    var values = message.trim().split('\n');
    var result = {};
    values.forEach(function(value) {
      /* Checks for '=' sign on each line in order to ignore empty lines and "#EnvironmentSource" */
      if (value.indexOf('=') !== -1) {
        var terms = value.split('=');
        result[terms[0]] = terms[1];
      }
    });
    setEnv(result);
    that.emit('environment', that.environment);
    that.initialized--;
    if (that.initialized == 0) that.emit('initialized');
  };

  var formatMemory = function(message) {
    /*
         * MemorySource,1415976582652,totalphysicalmemory=16725618688,physicalmemory=52428800,privatememory=374747136,virtualmemory=374747136,freephysicalmemory=1591525376
         */
    var values = message.split(/[,=]+/);
    var physicalTotal = parseInt(values[3]);
    var physicalFree = parseInt(values[11]);
    var physicalUsed = physicalTotal >= 0 && physicalFree >= 0 ? physicalTotal - physicalFree : -1;
    var memory = {
      time: parseInt(values[1]),
      physical_total: physicalTotal,
      physical_used: physicalUsed,
      physical: parseInt(values[5]),
      private: parseInt(values[7]),
      virtual: parseInt(values[9]),
      physical_free: physicalFree,
    };
    that.emit('memory', memory);
  };

  var formatGC = function(message) {
    /* gc_node : NodeGCData,1413903289280,S,48948480,13828320,7
         *                     , timestamp   ,M|S, size , used   , pause (ms)
         *
         * GC data can come in batches of multiple lines like the one in the example,
         * so first separate the lines, followed by the normal parsing.
         *
         */
    var lines = message.trim().split('\n');
    /* Split each line into the comma-separated values. */
    lines.forEach(function(line) {
      var values = line.split(/[,]+/);
      var gc = {
        time: parseInt(values[1]),
        type: values[2],
        size: parseInt(values[3]),
        used: parseInt(values[4]),
        duration: parseInt(values[5]),
      };
      that.emit('gc', gc);
    });
  };

  var formatProfiling = function(message) {
    if (appmetrics.getJSONProfilingMode()) {
      that.emit('profiling', JSON.parse(message));
    } else {
      var lines = message.trim().split('\n');
      var prof = {
        date: 0,
        functions: [],
      };
      lines.forEach(function(line) {
        var values = line.split(',');
        if (values[1] == 'Node') {
          prof.functions.push({
            self: parseInt(values[2]),
            parent: parseInt(values[3]),
            file: values[4],
            name: values[5],
            line: parseInt(values[6]),
            count: parseInt(values[7]),
          });
        } else if (values[1] == 'Start') {
          prof.time = parseInt(values[2]);
        }
      });
      that.emit('profiling', prof);
    }
  };

  var formatLoop = function(message) {
    /* loop_node: NodeLoopData,min,max,num,sum
    *
    */
    var lines = message.trim().split('\n');
    /* Split each line into the comma-separated values. */
    lines.forEach(function(line) {
      var values = line.split(/[,]+/);
      var loop = {
        minimum: parseFloat(values[1]),
        maximum: parseFloat(values[2]),
        count: parseInt(values[3]),
        average: parseFloat(values[4]),
        cpu_user: parseFloat(values[5]),
        cpu_system: parseFloat(values[6]),
      };
      that.emit('loop', loop);
    });
  };

  var formatApi = function(message) {
    var lines = message.trim().split('\n');
    lines.forEach(function(line) {
      var parts = line.split(/:(.+)/);
      var topic = parts[0];
      var data = serializer.deserialize(parts[1]);
      that.emit(topic, data);
    });
  };

  agent.localConnect(function events(topic, data) {
    if (topic === 'api') {
      // API events are passed by copy
      return;
    }
    raiseEvent(topic, data.toString());
  });
  //    agent.sendControlCommand("history", "");
}
module.exports.getAPI = function(agent, appmetrics) {
  return new API(agent, appmetrics);
};

util.inherits(API, EventEmitter);

API.prototype.enable = function(data) {
  var that = this;
  that.appmetrics.enable(data);
};

API.prototype.disable = function(data) {
  var that = this;
  that.appmetrics.disable(data);
};

API.prototype.getEnvironment = function() {
  var that = this;
  return that.environment;
};

API.prototype.raiseLocalEvent = function(topic, data) {
  var self = this;
  self.emit(topic, data);
};
