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

function MySqlProbe() {
  Probe.call(this, 'mysql');
}
util.inherits(MySqlProbe, Probe);

MySqlProbe.prototype.attach = function(name, target) {
  var that = this;
  if (name != 'mysql') return target;
  target.__ddProbeAttached__ = true;

  var data = {};
  aspect.after(target, 'createConnection', data, function(target, methodName, args, probeData, rc) {
    aspect.before(rc, 'query', function(target, methodName, methodArgs, probeData) {
      var method = 'query';
      that.metricsProbeStart(probeData, method, methodArgs);
      that.requestProbeStart(probeData, method, methodArgs);
      if (aspect.findCallbackArg(methodArgs) != undefined) {
        aspect.aroundCallback(methodArgs, probeData, function(target, args) {
          // Call the transaction link with a name and the callback for strong trace
          var callbackPosition = aspect.findCallbackArg(methodArgs);
          if (typeof callbackPosition != 'undefined') {
            aspect.strongTraceTransactionLink('mysql: ', method, methodArgs[callbackPosition]);
          }

          that.metricsProbeEnd(probeData, method, methodArgs);
          that.requestProbeEnd(probeData, method, methodArgs);
        });
      }
    });
    return rc;
  });
  return target;
};

/*
 * Lightweight metrics probe for MySQL queries
 *
 * These provide:
 * 		time:		time event started
 * 		query:		The SQL executed
 * 		duration:	the time for the request to respond
 */
MySqlProbe.prototype.metricsEnd = function(probeData, method, methodArgs) {
  if (probeData && probeData.timer) {
    probeData.timer.stop();
    var eventTimer = probeData.timer;
    am.emit('mysql', {
      time: eventTimer.startTimeMillis,
      query: JSON.stringify(methodArgs[0]),
      duration: eventTimer.timeDelta,
    });
  }
};

/*
 * Heavyweight request probes for MySQL queries
 */
MySqlProbe.prototype.requestStart = function(probeData, method, methodArgs) {
  probeData.req = request.startRequest('mysql', 'query', false, probeData.timer);
};

MySqlProbe.prototype.requestEnd = function(probeData, method, methodArgs) {
  if (probeData && probeData.req) probeData.req.stop({ sql: JSON.stringify(methodArgs[0]) });
};

module.exports = MySqlProbe;
