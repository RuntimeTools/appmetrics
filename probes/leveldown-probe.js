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

function LeveldownProbe() {
  Probe.call(this, 'leveldown');
}
util.inherits(LeveldownProbe, Probe);

function aspectLvldownMethod(dbTarget, methods, probe) {
  aspect.before(dbTarget, methods, function(dbTarget, methodName, methodArgs, probeData) {
    probe.metricsProbeStart(probeData, dbTarget, methodName, methodArgs);
    probe.requestProbeStart(probeData, dbTarget, methodName, methodArgs);
    if (aspect.findCallbackArg(methodArgs) != undefined) {
      aspect.aroundCallback(methodArgs, probeData, function(dbTarget, args, probeData) {
        // Call the transaction link with a name and the callback for strong trace
        var callbackPosition = aspect.findCallbackArg(methodArgs);
        if (typeof callbackPosition != 'undefined') {
          aspect.strongTraceTransactionLink('leveldown: ', methodName, methodArgs[callbackPosition]);
        }

        probe.metricsProbeEnd(probeData, methodName, methodArgs);
        probe.requestProbeEnd(probeData, methodName, methodArgs);
      });
    }
  });
}

// Attaches probe to module
LeveldownProbe.prototype.attach = function(name, target) {
  var that = this; // Referencing probe
  var methods = ['put', 'get', 'del', 'batch']; // Monitored leveldown methods
  if (name != 'leveldown') return target;
  if (target.__ddProbeAttached__) return target;

  // Wrapping the target in new function as leveldown returns constructor
  var newTarget = function() {
    var lvldownObj = target.apply(null, arguments);
    lvldownObj._ddProbeAttached_ = true;
    aspectLvldownMethod(lvldownObj, methods, that);
    return lvldownObj;
  };
  return newTarget;
};

/*
 * Lightweight metrics probe for leveldown queries
 *
 * These provide:
 * 		time:		time event started
 * 		method: 	leveldown method being executed
 *		key:		The key being used for a call to `get`, `put` or `del`
 *		value: 		The value being added to the LevelDB database using `put`
 *		opCount: 	The number of operations being performed by `batch`
 *		duration: 	The time taken for the LevelDB query to respond in ms
 *
 *		Note: key, value and opCount are undefined for methods other than those *		stated
 */

LeveldownProbe.prototype.metricsEnd = function(probeData, method, methodArgs) {
  if (probeData && probeData.timer) {
    probeData.timer.stop();
    if (method == 'put') {
      am.emit('leveldown', {
        time: probeData.timer.startTimeMillis,
        method: method,
        key: methodArgs[0],
        value: methodArgs[1],
        duration: probeData.timer.timeDelta,
      });
    } else if (method == 'del' || method == 'get') {
      am.emit('leveldown', {
        time: probeData.timer.startTimeMillis,
        method: method,
        key: methodArgs[0],
        duration: probeData.timer.timeDelta,
      });
    } else if (method == 'batch') {
      am.emit('leveldown', {
        time: probeData.timer.startTimeMillis,
        method: method,
        opCount: methodArgs[0].length,
        duration: probeData.timer.timeDelta,
      });
    }
  }
};

/*
 * Heavyweight request probes for leveldown queries
 */
LeveldownProbe.prototype.requestStart = function(probeData, dbTarget, method, methodArgs) {
  // FIXME(sam) req is used as a global to communicate with requestEnd, almost
  // certainly a bug, what happens if two requests are started before the first
  // ends? This is a bug, but it is being marked to be skipped by eslint
  // temporarily until it is fixed. See:
  //   https://github.com/RuntimeTools/appmetrics/pull/274#discussion_r122651577
  /* eslint-disable */
  req = request.startRequest('leveldown', 'query');
  req.setContext({ leveldown: methodArgs[0] });
  /* eslint-enable */
};

LeveldownProbe.prototype.requestEnd = function(probeData, method, methodArgs) {
  /* eslint-disable */
  if (probeData && probeData.req) req.stop({ leveldown: methodArgs[0] });
  /* eslint-enable */
};

module.exports = LeveldownProbe;
