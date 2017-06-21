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
var am = require('..');

function MemcachedProbe() {
  Probe.call(this, 'memcached');
}
util.inherits(MemcachedProbe, Probe);

MemcachedProbe.prototype.attach = function(name, target) {
  var that = this;
  if (name != 'memcached') return target;
  target.__ddProbeAttached__ = true;

  var methods = [
    // args: key, callback
    'get',
    'gets',
    'getMulti',
    // args: key, value, lifetime, callback
    'set',
    'replace',
    'add',
    // args: key, value, lifetime, cas, callback
    'cas',
    // args: key, value, callback
    'append',
    'prepend',
    // args: key, amount, callback
    'increment',
    'decrement',
    'incr',
    'decr',
    // args: key, callback
    'touch',
    // args: key, lifetime, callback
    'del',
    'delete',
    // args: callback
    // 'version', 'flush', 'samples', 'slabs', 'items'
  ];

  aspect.around(
    target.prototype,
    methods,
    function(target, methodName, methodArgs, context) {
      that.metricsProbeStart(context, methodName, methodArgs);
      that.requestProbeStart(context, methodName, methodArgs);
      aspect.aroundCallback(methodArgs, context, function(target, callbackArgs, context) {
        // Call the transaction link with a name and the callback for strong trace
        var callbackPosition = aspect.findCallbackArg(methodArgs);
        if (typeof callbackPosition != 'undefined') {
          aspect.strongTraceTransactionLink('memcached: ', methodName, methodArgs[callbackPosition]);
        }

        that.metricsProbeEnd(context, methodName, methodArgs);
        that.requestProbeEnd(context, methodName, methodArgs);
      });
    },
    function(target, methodName, methodArgs, context, rc) {
      if (aspect.findCallbackArg(methodArgs) == undefined) {
        that.metricsProbeEnd(context, methodName, methodArgs);
        that.requestProbeEnd(context, methodName, methodArgs);
      }
      return rc;
    }
  );
  return target;
};

/*
 * Lightweight metrics probe for Memcached data store
 *
 * These provide:
 * 		time:		time event started
 * 		method:		the API method/function being used
 * 		key:		The data key being used
 * 		duration:	the time for the request to respond
 */
MemcachedProbe.prototype.metricsEnd = function(context, method, methodArgs) {
  if (context && context.timer) {
    context.timer.stop();
    am.emit('memcached', {
      time: context.timer.startTimeMillis,
      method: method,
      key: methodArgs[0],
      duration: context.timer.timeDelta,
    });
  }
};

/*
 * Heavyweight request probes for Memcached data store
 */
MemcachedProbe.prototype.requestStart = function(context, methodName, methodArgs) {
  context.req = request.startRequest('memcached', methodName, false, context.timer);
};

MemcachedProbe.prototype.requestEnd = function(context, methodName, methodArgs) {
  if (context && context.req) context.req.stop({ key: methodArgs[0] });
};

module.exports = MemcachedProbe;
