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
var util = require('util');
var am = require('../');

/**
 * Probe to instrument the Oracle npm client
 */
function OracleProbe() {
  Probe.call(this, 'oracle');
}
util.inherits(OracleProbe, Probe);

OracleProbe.prototype.attach = function(name, target) {
  var that = this;
  if (name != 'oracle') return target;
  if (target.__probeAttached__) return;
  target.__probeAttached__ = true;

  console.dir(target);

  // After 'connect' (single-user connection model)
  aspect.before(target, 'connect', function(target, methodName, args, probeData) {
    aspect.aroundCallback(args, {}, function(target, callbackArgs, probeData) {
      var err = callbackArgs[0];
      if (!err) {
        var connection = callbackArgs[1];
        // Add monitoring
        addMonitoring(connection, that);

        // Add monitoring to prepared statements
        aspect.after(connection, 'prepare', function(target, methodName, args, context, ret) {
          addMonitoring(ret, that);
        });
      }
    });
  });
  return target;
};

// Monitor the 'execute' method on a connection or prepared statement
function addMonitoring(connection, probe) {
  aspect.around(
    connection,
    'execute',
    function(target, methodName, args, probeData) {
      // Start the monitoring for the 'execute' method
      probe.metricsProbeStart(probeData, methodName, args);
      probe.requestProbeStart(probeData, methodName, args);
      // Advise the callback for 'execute'. Will do nothing if no callback is registered
      aspect.aroundCallback(args, probeData, function(target, callbackArgs, probeData) {
        // 'execute' has completed and the callback has been called, so end the monitoring

        // Call the transaction link with a name and the callback for strong trace
        var callbackPosition = aspect.findCallbackArg(args);
        if (typeof callbackPosition != 'undefined') {
          aspect.strongTraceTransactionLink('oracle: ', methodName, args[callbackPosition]);
        }

        probe.metricsProbeEnd(probeData, methodName, args);
        probe.requestProbeEnd(probeData, methodName, args);
      });
    },
    function(target, methodName, args, probeData, rc) {
      // If no callback used then end the monitoring after returning from the 'execute' method instead
      if (aspect.findCallbackArg(args) == undefined) {
        probe.metricsProbeEnd(probeData, methodName, args);
        probe.requestProbeEnd(probeData, methodName, args);
      }
      return rc;
    }
  );
}

/*
 * Lightweight metrics probe end for Oracle queries
 */
OracleProbe.prototype.metricsEnd = function(probeData, method, methodArgs) {
  if (probeData && probeData.timer) {
    probeData.timer.stop();
    var query = methodArgs[0];
    am.emit('oracle', {
      time: probeData.timer.startTimeMillis,
      query: query,
      duration: probeData.timer.timeDelta,
    });
  }
};

/*
 * Heavyweight request probes for Oracle queries
 */
OracleProbe.prototype.requestStart = function(probeData, method, methodArgs) {
  probeData.req = request.startRequest('oracle', method, false, probeData.timer);
};

OracleProbe.prototype.requestEnd = function(probeData, method, methodArgs) {
  if (probeData && probeData.req) var query = methodArgs[0];
  probeData.req.stop({ query: query });
};

module.exports = OracleProbe;
