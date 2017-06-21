/*******************************************************************************
 * Copyright 2016 IBM Corp.
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

function Strong_MQProbe() {
  Probe.call(this, 'strong-mq');
}
util.inherits(Strong_MQProbe, Probe);

/*
 * Select the methods we want to instrument for each type of queue.
 */
var typeToMethods = {
  createPushQueue: ['publish'],
  createPullQueue: ['on', 'addListener'],
  createPubQueue: ['publish'],
  createSubQueue: ['on', 'addListener'],
};

var typeToEventType = {
  createPushQueue: 'push',
  createPullQueue: 'pull',
  createPubQueue: 'pub',
  createSubQueue: 'sub',
};

Strong_MQProbe.prototype.attach = function(name, target) {
  var that = this;
  if (name != 'strong-mq') {
    return target;
  }
  target.__ddProbeAttached__ = true;
  aspect.after(target, 'create', {}, function(target, methodName, methodArgs, context, connection) {
    aspect.after(connection, ['createPushQueue', 'createPubQueue'], {}, function(
      target,
      methodName,
      methodArgs,
      context,
      queue
    ) {
      var socketType = methodName;
      var methods = typeToMethods[socketType];
      aspect.around(
        queue,
        methods,
        function(target, methodName, methodArgs, context) {
          that.metricsProbeStart(context, methodName, methodArgs);
          that.requestProbeStart(context, methodName, methodArgs);
          aspect.aroundCallback(methodArgs, context, function(target, args, context) {
            // Call the transaction link with a name and the callback for strong trace
            var callbackPosition = aspect.findCallbackArg(methodArgs);
            if (typeof callbackPosition != 'undefined') {
              aspect.strongTraceTransactionLink('strong-mq: ', methodName, methodArgs[callbackPosition]);
            }

            that.metricsProbeEnd(context, methodName, methodArgs);
            that.requestProbeEnd(context, methodName, methodArgs);
          });
        },
        function(target, methodName, methodArgs, context, rc) {
          if (aspect.findCallbackArg(methodArgs) == undefined) {
            that.metricsProbeEnd(context, methodName, methodArgs, typeToEventType[socketType]);
            that.requestProbeEnd(context, methodName, methodArgs, typeToEventType[socketType]);
          }
          return rc;
        }
      );
      return queue;
    });
    aspect.after(connection, ['createPullQueue', 'createSubQueue'], {}, function(
      target,
      methodName,
      methodArgs,
      context,
      queue
    ) {
      var socketType = methodName;
      var methods = typeToMethods[socketType];
      aspect.before(queue, methods, function(target, methodName, methodArgs, context) {
        var eventName = 'message';
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
                aspect.strongTraceTransactionLink('strong-mq: ', methodName, methodArgs[callbackPosition]);
              }

              that.metricsProbeEnd(context, eventName, methodArgs, typeToEventType[socketType]);
              that.requestProbeEnd(context, eventName, methodArgs, typeToEventType[socketType]);
              return rc;
            }
          );
        }
      });
      return queue;
    });
    return connection;
  });
  return target;
};

/*
 * Lightweight metrics probe for STRONG-MQ messaging
 * Provide basic information on messages sent and received.
 * These provide:
 *		time:		time event started
 *      type:		whether this was a pub, sub, push or pull event.
 *		method:		if this was a method call (a send) the method name
 *		event:		if this was an event (a message was received) the name of the event
 *		duration:	the time for the request to respond
 */
Strong_MQProbe.prototype.metricsEnd = function(context, methodName, methodArgs, eventType) {
  if (context && context.timer) {
    context.timer.stop();
    // default to quality of service (qos) 0, as that's what the strong-mq module does
    var eventData = {
      time: context.timer.startTimeMillis,
      duration: context.timer.timeDelta,
      type: eventType,
    };
    if (methodName == 'publish') {
      eventData.method = methodName;
    } else {
      eventData.event = 'message';
    }
    am.emit('strong-mq', eventData);
  }
};

/*
 * Heavyweight request probes for STRONG-MQ messages
 */
Strong_MQProbe.prototype.requestStart = function(context, methodName, methodArgs, socketType) {
  if (methodName === 'publish') {
    context.req = request.startRequest('strong-mq', methodName, false, context.timer);
  } else {
    /* Received messages mark the start of requests. */
    context.req = request.startRequest('strong-mq', 'message', true, context.timer);
  }
};

Strong_MQProbe.prototype.requestEnd = function(context, methodName, methodArgs, socketType) {
  if (context && context.req) context.req.stop({ topic: methodArgs[0] });
};

module.exports = Strong_MQProbe;
