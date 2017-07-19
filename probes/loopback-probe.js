/*******************************************************************************
 * Copyright 2015 IBM Corp.
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

var Probe = require('../lib/probe.js');
var aspect = require('../lib/aspect.js');
var request = require('../lib/request.js');
var am = require('../');
var util = require('util');

function loopbackDJProbe() {
  Probe.call(this, 'loopback-datasource-juggler');
}
util.inherits(loopbackDJProbe, Probe);

function aspectJugglerMethod(target, methods, probe) {
  aspect.before(target, methods, function(target, methodName, methodArgs, probeData) {
    probe.metricsProbeStart(probeData, target, methodName, methodArgs);
    probe.requestProbeStart(probeData, target, methodName, methodArgs);
    if (aspect.findCallbackArg(methodArgs) != undefined) {
      aspect.aroundCallback(methodArgs, probeData, function(target, args, probeData) {
        // Call the transaction link with a name and the callback for strong trace
        var callbackPosition = aspect.findCallbackArg(methodArgs);
        if (typeof callbackPosition != 'undefined') {
          aspect.strongTraceTransactionLink('loopback-datasource-juggler: ', methodName, methodArgs[callbackPosition]);
        }

        probe.metricsProbeEnd(probeData, methodName, methodArgs);
        probe.requestProbeEnd(probeData, methodName, methodArgs);
      });
    }
  });
}

// Attaches probe to module
loopbackDJProbe.prototype.attach = function(name, target) {
  var that = this;
  if (name != 'loopback-datasource-juggler') return target;
  if (target.__ddProbeAttached__) return target;

  // functions of DataAccessObject inherited from PersistedModel
  var commands = ['create', 'findOrCreate', 'exists', 'find', 'findById', 'remove', 'removeById', 'count'];
  var instanceCommands = ['save', 'remove', 'updateAttribute', 'updateAttributes', 'reload'];
  var dao = target.Schema.DataAccessObject;

  aspectJugglerMethod(dao, commands, that); // Instrument class methods
  aspectJugglerMethod(dao.prototype, instanceCommands, that); // Instrument instance methods

  return target;
};

/*
 * Lightweight metrics probe for Postgres queries
 *
 * These provide:
 * 		time:		time event started
 * 		query:		The command the juggler has executed
 * 		duration:	the time for the request to respond
 */
loopbackDJProbe.prototype.metricsEnd = function(probeData, method, methodArgs) {
  if (probeData && probeData.timer) {
    probeData.timer.stop();
    var eventTimer = probeData.timer;
    am.emit('loopback-datasource-juggler', {
      time: eventTimer.startTimeMillis,
      method: method,
      duration: eventTimer.timeDelta,
    });
  }
};

/*
 * Heavyweight request probes for juggler commands
 */
loopbackDJProbe.prototype.requestStart = function(probeData, target, method, methodArgs) {
  probeData.req = request.startRequest('loopback-datasource-juggler', 'query');
  probeData.req.setContext({ loopbackDJProbe: methodArgs[0] });
};

loopbackDJProbe.prototype.requestEnd = function(probeData, method, methodArgs) {
  if (probeData && probeData.req) probeData.req.stop({ loopbackDJProbe: methodArgs[0] });
};

module.exports = loopbackDJProbe;
