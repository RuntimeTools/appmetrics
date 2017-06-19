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

function SocketioProbe() {
  Probe.call(this, 'socket.io');
}
util.inherits(SocketioProbe, Probe);

SocketioProbe.prototype.attach = function(name, target) {
  var that = this;
  if (name != 'socket.io') return target;
  /*
	 * Don't set __ddProbeAttached__ = true as we need to probe and return
	 * the constructor each time
	 */

  /*
	 * Patch the constructor so that we can patch io.sockets.emit() calls
	 * to broadcast to clients. This also picks up calls to io.emit() as
	 * they map down to io.socket.emit()
	 */
  var newtarget = aspect.afterConstructor(target, {}, function(target, methodName, methodArgs, context, server) {
    var broadcast = 'broadcast';
    aspect.around(
      server.sockets,
      'emit',
      function(target, methodName, methodArgs, context) {
        that.metricsProbeStart(context, broadcast, methodArgs);
        that.requestProbeStart(context, broadcast, methodArgs);
      },
      function(target, methodName, methodArgs, context, rc) {
        that.metricsProbeEnd(context, broadcast, methodArgs);
        that.requestProbeEnd(context, broadcast, methodArgs);
      }
    );
    return server;
  });
  /*
	 * Remap the listen API to point to new constructor
	 */
  newtarget.listen = newtarget;

  /*
	 * We patch the constructor every time, but only want to patch prototype
	 * functions once otherwise we'll generate multiple events
	 */
  if (!target.__prototypeProbeAttached__) {
    target.__prototypeProbeAttached__ = true;

    aspect.before(target.prototype, ['on', 'addListener'], function(target, methodName, methodArgs, context) {
      if (methodArgs[0] !== 'connection') return;
      if (aspect.findCallbackArg(methodArgs) != undefined) {
        aspect.aroundCallback(methodArgs, context, function(target, methodArgs, context) {
          var socket = methodArgs[0];
          /*
						 * Patch Socket#emit() calls
						 */
          aspect.around(
            socket,
            'emit',
            function(target, methodName, methodArgs, context) {
              that.metricsProbeStart(context, methodName, methodArgs);
              that.requestProbeStart(context, methodName, methodArgs);
            },
            function(target, methodName, methodArgs, context, rc) {
              // Call the transaction link with a name and the callback for strong trace
              var callbackPosition = aspect.findCallbackArg(methodArgs);
              if (typeof callbackPosition != 'undefined') {
                aspect.strongTraceTransactionLink('socket.io: ', methodName, methodArgs[callbackPosition]);
              }

              that.metricsProbeEnd(context, methodName, methodArgs);
              that.requestProbeEnd(context, methodName, methodArgs);
              return rc;
            }
          );
          /*
						 * Patch socket.on incoming events
						 */
          var receive = 'receive';
          aspect.before(socket, ['on', 'addListener'], function(target, methodName, methodArgs, context) {
            aspect.aroundCallback(
              methodArgs,
              context,
              function(target, callbackArgs, context) {
                that.metricsProbeStart(context, receive, methodArgs);
                that.requestProbeStart(context, receive, methodArgs);
              },
              function(target, callbackArgs, context, rc) {
                // Call the transaction link with a name and the callback for strong trace
                var callbackPosition = aspect.findCallbackArg(methodArgs);
                if (typeof callbackPosition != 'undefined') {
                  aspect.strongTraceTransactionLink('socket.io: ', methodName, methodArgs[callbackPosition]);
                }

                that.metricsProbeEnd(context, receive, methodArgs);
                that.requestProbeEnd(context, receive, methodArgs);
                return rc;
              }
            );
          });
        });
      }
    });
  }
  return newtarget;
};

/*
 * Lightweight metrics probe for Socket.io websocket connections
 *
 * These provide:
 * 		time:		time event started
 * 		method:		the type of socket.io action
 * 		event:		the event broadcast/emitted/received
 * 		duration:	the time for the action to complete
 */
SocketioProbe.prototype.metricsEnd = function(context, methodName, methodArgs) {
  if (context && context.timer) {
    context.timer.stop();
    am.emit('socketio', {
      time: context.timer.startTimeMillis,
      method: methodName,
      event: methodArgs[0],
      duration: context.timer.timeDelta,
    });
  }
};

/*
 * Heavyweight request probes for Socket.io websocket connections
 */
SocketioProbe.prototype.requestStart = function(context, methodName, methodArgs) {
  /*
	 * method names are "broadcast", "receive" and "emit"
	 */
  if (methodName !== 'receive') {
    context.req = request.startRequest('socketio', methodName, false, context.timer);
  } else {
    context.req = request.startRequest('socketio', methodName, true, context.timer);
  }
};

SocketioProbe.prototype.requestEnd = function(context, methodName, methodArgs) {
  if (context && context.req) context.req.stop({ method: methodName, event: methodArgs[0] });
};

module.exports = SocketioProbe;
