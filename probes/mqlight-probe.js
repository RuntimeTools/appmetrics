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
 * Probe to instrument the MQLight npm client
 */
function MQLightProbe() {
  Probe.call(this, 'mqlight');
}
util.inherits(MQLightProbe, Probe);

MQLightProbe.prototype.attach = function(name, target) {
  var that = this;
  if (name != 'mqlight') return target;
  if (target.__probeAttached__) return;
  target.__probeAttached__ = true;

  // After 'createClient'
  aspect.after(target, 'createClient', {}, function(target, methodName, createClientArgs, context, rc) {
    var thisClient = rc; // the MQLight client that was created
    // Just monitor 'send' for now as not sure what else will be useful
    var methods = 'send';
    // Before one of the above methods is called on the client
    aspect.around(
      thisClient,
      methods,
      function(target, methodName, args, probeData) {
        // Start the monitoring for the method
        that.metricsProbeStart(probeData, methodName, args);
        that.requestProbeStart(probeData, methodName, args);
        // Advise the callback for the method.  Will do nothing if no callback is registered
        aspect.aroundCallback(args, probeData, function(target, callbackArgs, probeData) {
          // method has completed and the callback has been called, so end the monitoring

          // Call the transaction link with a name and the callback for strong trace
          var callbackPosition = aspect.findCallbackArg(args);
          if (typeof callbackPosition != 'undefined') {
            aspect.strongTraceTransactionLink('mqlight: ', methodName, args[callbackPosition]);
          }

          that.metricsProbeEnd(probeData, methodName, args, thisClient);
          that.requestProbeEnd(probeData, methodName, args, thisClient);
        });
      },
      function(target, methodName, args, probeData, rc) {
        // If no callback used then end the monitoring after returning from the method instead
        if (aspect.findCallbackArg(args) == undefined) {
          that.metricsProbeEnd(probeData, methodName, args, thisClient);
          that.requestProbeEnd(probeData, methodName, args, thisClient);
        }
        return rc;
      }
    );

    // Advise the callback code that is called when a message is received
    aspect.before(thisClient, 'on', function(target, methodName, args, probeData) {
      // only care about 'message' events
      if (args[0] == 'message') {
        // Must be a callback so no need to check for it
        aspect.aroundCallback(
          args,
          {},
          function(obj, callbackArgs, probeData) {
            that.metricsProbeStart(probeData, 'message', callbackArgs);
            that.requestProbeStart(probeData, 'message', callbackArgs);
          },
          function(target, callbackArgs, probeData, ret) {
            // method has completed and the callback has been called, so end the monitoring

            // Call the transaction link with a name and the callback for strong trace
            var callbackPosition = aspect.findCallbackArg(callbackArgs);
            if (typeof callbackPosition != 'undefined') {
              aspect.strongTraceTransactionLink('mqlight: ', methodName, callbackArgs[callbackPosition]);
            }

            that.metricsProbeEnd(probeData, 'message', callbackArgs, thisClient);
            that.requestProbeEnd(probeData, 'message', callbackArgs, thisClient);
            return ret;
          }
        );
      }
    });
    return rc;
  });
  return target;
};

/*
 * Lightweight metrics probe end for MQLight messages
 */
MQLightProbe.prototype.metricsEnd = function(probeData, method, methodArgs, client) {
  if (probeData && probeData.timer) {
    probeData.timer.stop();
    /* eslint no-redeclare:0 */
    if (method == 'message') {
      var data = methodArgs[0];
      if (data.length > 25) {
        data = data.substring(0, 22) + '...';
      }
      var topic = methodArgs[1].message.topic;
      am.emit('mqlight', {
        time: probeData.timer.startTimeMillis,
        clientid: client.id,
        data: data,
        method: method,
        topic: topic,
        duration: probeData.timer.timeDelta,
      });
    } else if (method == 'send') {
      var data = methodArgs[1];
      if (data.length > 25) {
        data = data.substring(0, 22) + '...';
      }
      var qos;
      var options; // options are optional - check number of arguments.
      if (methodArgs.length > 3) {
        options = methodArgs[2];
        qos = options[0];
      }
      am.emit('mqlight', {
        time: probeData.timer.startTimeMillis,
        clientid: client.id,
        data: data,
        method: method,
        topic: methodArgs[0],
        qos: qos,
        duration: probeData.timer.timeDelta,
      });
    }
  }
};

/*
 * Heavyweight request probes for MQLight messages
 */
MQLightProbe.prototype.requestStart = function(probeData, method, methodArgs) {
  if (method == 'message') {
    probeData.req = request.startRequest('mqlight', method, true, probeData.timer);
  } else {
    probeData.req = request.startRequest('mqlight', method, false, probeData.timer);
  }
};

MQLightProbe.prototype.requestEnd = function(probeData, method, methodArgs, client) {
  if (probeData && probeData.req) {
    if (method == 'message') {
      var data = methodArgs[0];
      if (data.length > 25) {
        data = data.substring(0, 22) + '...';
      }
      probeData.req.stop({
        clientid: client.id,
        data: data,
        method: method,
        topic: methodArgs[0],
      });
    } else if (method == 'send') {
      var data = methodArgs[1];
      if (data.length > 25) {
        data = data.substring(0, 22) + '...';
      }
      var qos;
      var options; // options are optional - check number of arguments.
      if (methodArgs.length > 3) {
        options = methodArgs[2];
        qos = options[0];
      }
      probeData.req.stop({
        clientid: client.id,
        data: data,
        method: method,
        topic: methodArgs[0],
        qos: qos,
      });
    }
  }
};

module.exports = MQLightProbe;
