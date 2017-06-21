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

function AxonProbe() {
  Probe.call(this, 'axon');
}
util.inherits(AxonProbe, Probe);

/*
 * Select the methods we want to instrument for each type of socket.
 */
var sendTypeToMethod = {
  push: 'send',
  pub: 'send',
  req: 'send',
};

sendTypeToMethod['pub-emitter'] = 'emit';

function isSendMethod(type) {
  if (sendTypeToMethod[type]) {
    return true;
  } else {
    return false;
  }
}

AxonProbe.prototype.attach = function(name, target) {
  var that = this;
  if (name != 'axon') return target;
  target.__ddProbeAttached__ = true;

  aspect.after(target, ['socket'], {}, function(target, methodName, methodArgs, context, client) {
    var socketType = methodArgs[0];
    if (isSendMethod(socketType)) {
      var methods = sendTypeToMethod[socketType];
      aspect.around(
        client,
        methods,
        function(target, methodName, methodArgs, context) {
          that.metricsProbeStart(context, methodName, methodArgs);
          that.requestProbeStart(context, methodName, methodArgs);
          aspect.aroundCallback(methodArgs, context, function(target, args, context) {
            // Call the transaction link with a name and the callback for strong trace
            var callbackPosition = aspect.findCallbackArg(methodArgs);
            if (typeof callbackPosition != 'undefined') {
              aspect.strongTraceTransactionLink('axon', methodName, methodArgs[callbackPosition]);
            }

            that.metricsProbeEnd(context, methodName, methodArgs, socketType);
            that.requestProbeEnd(context, methodName, methodArgs, socketType);
          });
        },
        function(target, methodName, methodArgs, context, rc) {
          if (aspect.findCallbackArg(methodArgs) == undefined) {
            that.metricsProbeEnd(context, methodName, methodArgs, socketType);
            that.requestProbeEnd(context, methodName, methodArgs, socketType);
          }
          return rc;
        }
      );
    } else {
      aspect.before(client, ['on', 'addListener'], function(target, methodName, methodArgs, context) {
        var eventName = methodArgs[0];
        if (aspect.findCallbackArg(methodArgs) != undefined) {
          aspect.aroundCallback(
            methodArgs,
            context,
            function(target, args, context) {
              // Call the transaction link with a name and the callback for strong trace
              var callbackPosition = aspect.findCallbackArg(methodArgs);
              if (typeof callbackPosition != 'undefined') {
                aspect.strongTraceTransactionLink('axon: ', eventName, args[callbackPosition]);
              }

              that.metricsProbeStart(context, eventName, methodArgs, socketType);
              that.requestProbeStart(context, eventName, methodArgs, socketType);
            },
            function(target, methodArgs, context, rc) {
              that.metricsProbeEnd(context, eventName, methodArgs, socketType);
              that.requestProbeEnd(context, eventName, methodArgs, socketType);
              return rc;
            }
          );
        }
      });
    }
    return client;
  });
  return target;
};

/*
 * Lightweight metrics probe for AXON messaging
 * Provide basic information on messages sent and received.
 * These provide:
 *		time:		time event started
 *		method:		whether this was a received message 'in' or sent 'out'
 *		type:
 *		topic:		the topic the message was received on
 *		duration:	the time for the request to respond
 */
AxonProbe.prototype.metricsEnd = function(context, methodName, methodArgs, socketType) {
  if (context && context.timer) {
    context.timer.stop();
    // default to quality of service (qos) 0, as that's what the axon module does
    if (isSendMethod(socketType)) {
      am.emit('axon', {
        time: context.timer.startTimeMillis,
        method: methodName,
        duration: context.timer.timeDelta,
        type: socketType,
      });
    } else {
      am.emit('axon', {
        time: context.timer.startTimeMillis,
        event: methodName,
        duration: context.timer.timeDelta,
        type: socketType,
      });
    }
  }
};

/*
 * Heavyweight request probes for AXON messages
 */
AxonProbe.prototype.requestStart = function(context, methodName, methodArgs) {
  if (methodName === 'message') {
    context.req = request.startRequest('axon', methodName, true, context.timer);
  } else {
    context.req = request.startRequest('axon', methodName, false, context.timer);
  }
};

AxonProbe.prototype.requestEnd = function(context, methodName, methodArgs) {
  if (context && context.req) context.req.stop({ topic: methodArgs[0] });
};

module.exports = AxonProbe;
