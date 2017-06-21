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

function PostgresProbe() {
  Probe.call(this, 'pg');
}

util.inherits(PostgresProbe, Probe);

// This method attaches our probe to the instance of the postgres module (target)
PostgresProbe.prototype.attach = function(name, target) {
  var that = this;
  if (name != 'pg') return target;
  if (target.__ddProbeAttached__) return target;
  target.__ddProbeAttached__ = true;

  var data = {};

  // There are two methods to connect to a pg instance
  // Client Pooling or Client Instance. See https://www.npmjs.com/package/pg

  // Client Pooling
  // Before we connect
  aspect.before(target, 'connect', function(target, methodName, methodArgs, probeData) {
    // Get client result from connect callback
    if (aspect.findCallbackArg(methodArgs) != undefined) {
      aspect.aroundCallback(methodArgs, probeData, function(target, args, probeData) {
        // Extract client
        var client = args[1];

        // Connection pooling means we may get clients we have seen before
        // so only monitor queries on this client if we haven't seen it before
        if (!client.__appmetricsProbeAttached__) {
          client.__appmetricsProbeAttached__ = true;

          // Start monitoring
          monitorQuery(client, that);
        }
      });
    }
  });

  // Client Instance
  // After the client has been instantiated
  aspect.after(target, 'Client', data, function(clientTarget, methodName, methodArgs, probeData, rc) {
    // After a connection has been established on the client
    aspect.after(clientTarget, 'connect', data, function(connectionTarget, methodName, args, probeData, rc) {
      // Before the query hits, start monitoring
      monitorQuery(connectionTarget, that);
      return rc;
    });
  });
  return target;
};

// This function monitors the query method given a connected
// client and the current 'PostgresProbe' reference
function monitorQuery(client, that) {
  aspect.before(client, 'query', function(target, methodName, methodArgs, probeData) {
    var method = 'query';
    that.metricsProbeStart(probeData, target, method, methodArgs);
    that.requestProbeStart(probeData, target, method, methodArgs);
    if (aspect.findCallbackArg(methodArgs) != undefined) {
      aspect.aroundCallback(methodArgs, probeData, function(target, args, probeData) {
        // Here, the query has executed and returned it's callback. Then
        // stop monitoring

        // Call the transaction link with a name and the callback for strong trace
        var callbackPosition = aspect.findCallbackArg(methodArgs);
        if (typeof callbackPosition != 'undefined') {
          aspect.strongTraceTransactionLink('pg: ', method, methodArgs[callbackPosition]);
        }

        that.metricsProbeEnd(probeData, method, methodArgs);
        that.requestProbeEnd(probeData, method, methodArgs);
      });
    }
  });
}

/*
 * Lightweight metrics probe for Postgres queries
 *
 * These provide:
 *      time:       time event started
 *      query:      The SQL executed
 *      duration:   the time for the request to respond
 */
PostgresProbe.prototype.metricsEnd = function(probeData, method, methodArgs) {
  if (probeData && probeData.timer) {
    probeData.timer.stop();
    am.emit('postgres', {
      time: probeData.timer.startTimeMillis,
      query: methodArgs[0],
      duration: probeData.timer.timeDelta,
    });
  }
};

/*
 * Heavyweight request probes for Postgres queries
 */
PostgresProbe.prototype.requestStart = function(probeData, target, method, methodArgs) {
  probeData.req = request.startRequest('postgres', 'query', false, probeData.timer);
  probeData.req.setContext({ sql: methodArgs[0] });
};

PostgresProbe.prototype.requestEnd = function(probeData, method, methodArgs) {
  if (probeData && probeData.req) probeData.req.stop({ sql: methodArgs[0] });
};

module.exports = PostgresProbe;
