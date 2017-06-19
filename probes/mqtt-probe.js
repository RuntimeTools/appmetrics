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

function MqttProbe() {
  Probe.call(this, 'mqtt');
}
util.inherits(MqttProbe, Probe);

MqttProbe.prototype.attach = function(name, target) {
  var that = this;
  if (name != 'mqtt') return target;
  target.__ddProbeAttached__ = true;

  aspect.after(target, 'connect', {}, function(target, methodName, methodArgs, context, client) {
    aspect.around(
      client,
      'publish',
      function(target, methodName, methodArgs, context) {
        that.metricsProbeStart(context, methodName, methodArgs);
        that.requestProbeStart(context, methodName, methodArgs);
        aspect.aroundCallback(methodArgs, context, function(target, args, context) {
          // Call the transaction link with a name and the callback for strong trace
          var callbackPosition = aspect.findCallbackArg(methodArgs);
          if (typeof callbackPosition != 'undefined') {
            aspect.strongTraceTransactionLink('mqtt: ', methodName, methodArgs[callbackPosition]);
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

    var methods = ['on', 'addListener'];
    aspect.before(client, methods, function(target, methodName, methodArgs, context) {
      var eventName = 'message';
      if (methodArgs[0] !== eventName) return;
      if (aspect.findCallbackArg(methodArgs) != undefined) {
        aspect.aroundCallback(
          methodArgs,
          context,
          function(target, args, context) {
            that.metricsProbeStart(context, eventName, methodArgs);
            that.requestProbeStart(context, eventName, methodArgs);
          },
          function(target, methodArgs, context, rc) {
            // Call the transaction link with a name and the callback for strong trace
            var callbackPosition = aspect.findCallbackArg(methodArgs);
            if (typeof callbackPosition != 'undefined') {
              aspect.strongTraceTransactionLink('mqtt: ', methodName, methodArgs[callbackPosition]);
            }

            that.metricsProbeEnd(context, eventName, methodArgs);
            that.requestProbeEnd(context, eventName, methodArgs);
            return rc;
          }
        );
      }
    });
    return client;
  });
  return target;
};

/*
 * Lightweight metrics probe for MQTT messaging
 *
 * These provide:
 *		time:		time event started
 *		method:		whether this was a received 'message' or a 'publish'
 *		topic:		the topic the message was received on
 *		qos:		the quality of service (QoS) for the message
 *		duration:	the time for the request to respond
 */
MqttProbe.prototype.metricsEnd = function(context, methodName, methodArgs) {
  if (context && context.timer) {
    context.timer.stop();
    // default to quality of service (qos) 0, as that's what the mqtt module does
    var qos = 0;
    if (methodArgs[2] && typeof methodArgs[2] !== 'function') {
      qos = methodArgs[2].qos;
    }
    am.emit('mqtt', {
      time: context.timer.startTimeMillis,
      method: methodName,
      topic: methodArgs[0],
      qos: qos,
      duration: context.timer.timeDelta,
    });
  }
};

/*
 * Heavyweight request probes for MQTT messages
 */
MqttProbe.prototype.requestStart = function(context, methodName, methodArgs) {
  if (methodName === 'message') {
    context.req = request.startRequest('mqtt', methodName, true, context.timer);
  } else {
    context.req = request.startRequest('mqtt', methodName, false, context.timer);
  }
};

MqttProbe.prototype.requestEnd = function(context, methodName, methodArgs) {
  if (context && context.req) {
    var qos = 0;
    if (methodArgs[2] && typeof methodArgs[2] !== 'function') {
      qos = methodArgs[2].qos;
    }
    context.req.stop({ topic: methodArgs[0], qos: qos });
  }
};

module.exports = MqttProbe;
