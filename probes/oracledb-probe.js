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
 * Probe to instrument the Oracle-DB npm client
 */
function OracleDBProbe() {
  Probe.call(this, 'oracledb');
}
util.inherits(OracleDBProbe, Probe);

OracleDBProbe.prototype.attach = function(name, target) {
  var that = this;
  if (name != 'oracledb') return target;
  if (target.__probeAttached__) return target;
  target.__probeAttached__ = true;

  // After 'getConnection' (single-user connection model)
  aspect.before(target, 'getConnection', function(target, methodName, args, probeData) {
    aspect.aroundCallback(args, {}, function(target, callbackArgs, probeData) {
      var err = callbackArgs[0];
      if (!err) {
        var connection = callbackArgs[1];
        // Add monitoring
        addMonitoring(connection, that);
      }
    });
  });

  // Connection pooling
  aspect.before(target, 'createPool', function(target, methodName, args, context) {
    aspect.aroundCallback(args, {}, function(target, callbackArgs, probeData) {
      var err = callbackArgs[0];
      if (!err) {
        var pool = callbackArgs[1];
        aspect.before(pool, 'getConnection', function(target, methodName, args, probeData) {
          aspect.aroundCallback(args, {}, function(target, callbackArgs, probeData) {
            var err = callbackArgs[0];
            if (!err) {
              var connection = callbackArgs[1];
              // Don't attach to the same connection more than once when connections are pooled
              if (!connection.__appmetricsProbeAttached__) {
                connection.__appmetricsProbeAttached__ = true;
                // Add monitoring
                addMonitoring(connection, that);
              }
            }
          });
        });
      }
    });
  });
  return target;
};

// Monitor the 'execute' method on a connection
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
          aspect.strongTraceTransactionLink('oracledb: ', methodName, args[callbackPosition]);
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
 * Lightweight metrics probe end for OracleDB queries
 */
OracleDBProbe.prototype.metricsEnd = function(probeData, method, methodArgs) {
  if (probeData && probeData.timer) {
    probeData.timer.stop();
    var query = methodArgs[0];
    am.emit('oracledb', {
      time: probeData.timer.startTimeMillis,
      query: query,
      duration: probeData.timer.timeDelta,
    });
  }
};

/*
 * Heavyweight request probes for OracleDB queries
 */
OracleDBProbe.prototype.requestStart = function(probeData, method, methodArgs) {
  probeData.req = request.startRequest('oracledb', method, false, probeData.timer);
};

OracleDBProbe.prototype.requestEnd = function(probeData, method, methodArgs) {
  if (probeData && probeData.req) {
    var query = methodArgs[0];
    probeData.req.stop({ query: query });
  }
};

module.exports = OracleDBProbe;
