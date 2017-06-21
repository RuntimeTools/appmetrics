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

// Riak methods can have different arguments.
// Methods which only have a 'callback' parameter
var callbackOnlyMethods = ['ping', 'shutdown', 'stop'];

// Methods which have 'options' and 'callback' parameters
var optionsAndCallbackMethods = [
  'deleteValue',
  'deleteIndex',
  'fetchBucketProps',
  'fetchBucketTypeProps',
  'fetchCounter',
  'fetchIndex',
  'fetchMap',
  'fetchPreflist',
  'fetchSchema',
  'fetchSet',
  'fetchValue',
  'listBuckets',
  'listKeys',
  'search',
  'secondaryIndexQuery',
  'storeBucketProps',
  'storeBucketTypeProps',
  'storeIndex',
  'storeSchema',
  'storeValue',
  'tsDelete',
  'tsDescribe',
  'tsGet',
  'tsListKeys',
  'tsQuery',
  'tsStore',
  'updateCounter',
  'updateMap',
  'updateSet',
];

// Methods which have a 'command' parameter, 'query' parameter and no parameters
var commandMethods = ['execute'];
var queryMethods = ['mapReduce'];
var noParameterMethods = ['getRiakCluster'];

function RiakProbe() {
  Probe.call(this, 'basho-riak-client');
}
util.inherits(RiakProbe, Probe);

RiakProbe.prototype.attach = function(name, target) {
  var that = this;
  if (name != 'basho-riak-client') return target;
  if (target.__ddProbeAttached__) return target;
  target.__ddProbeAttached__ = true;

  var data = {};
  aspect.after(target, 'Client', data, function(clientTarget, methodName, args, probeData, rc) {
    // For all methods
    var methods = callbackOnlyMethods.concat(
      optionsAndCallbackMethods,
      commandMethods,
      queryMethods,
      noParameterMethods
    );

    // Start probing before the method is executed
    aspect.around(
      clientTarget,
      methods,
      function(target, methodName, methodArgs, probeData) {
        that.metricsProbeStart(probeData, target, methodName, methodArgs);
        that.requestProbeStart(probeData, target, methodName, methodArgs);

        // If the method contains a callback, finish probing when the callback returns
        if (aspect.findCallbackArg(methodArgs) != undefined) {
          aspect.aroundCallback(methodArgs, probeData, function(target, args, probeData) {
            // Call the transaction link with a name and the callback for strong trace
            var callbackPosition = aspect.findCallbackArg(methodArgs);
            if (typeof callbackPosition != 'undefined') {
              aspect.strongTraceTransactionLink('basho-riak-client: ', methodName, methodArgs[callbackPosition]);
            }

            that.metricsProbeEnd(probeData, methodName, methodArgs);
            that.requestProbeEnd(probeData, methodName, methodArgs);
          });
        }
      },
      // Otherwise if there is no callback finish probing when the method returns
      function(target, methodName, methodArgs, probeData, rc) {
        if (aspect.findCallbackArg(methodArgs) == undefined) {
          that.metricsProbeEnd(probeData, methodName, methodArgs);
          that.requestProbeEnd(probeData, methodName, methodArgs);
        }
        return rc;
      }
    );
    return rc;
  });
  return target;
};

/*
 * Lightweight metrics probe for Riak queries
 *
 * These provide:
 *      time:       Time event started
 *      method:     The name of the riak method used
 *      options:    The options parameter (if present)
 *      command:    The command parameter (if present)
 *      query:      The query parameter (if present)
 *      duration:   The time for the request to respond
 */
RiakProbe.prototype.metricsEnd = function(probeData, method, methodArgs) {
  if (probeData && probeData.timer) {
    probeData.timer.stop();
    var eventTimer = probeData.timer;

    // Work out if options, command or query are needed. Defaults to just method
    var jsonToEmit = {
      time: eventTimer.startTimeMillis,
      method: method,
      duration: eventTimer.timeDelta,
    };
    var key = '';

    if (optionsAndCallbackMethods.indexOf(method) > -1) {
      key = 'options';
    } else if (commandMethods.indexOf(method) > -1) {
      key = 'command';
    } else if (queryMethods.indexOf(method) > -1) {
      key = 'query';
    }

    if (key != '') {
      jsonToEmit[key] = methodArgs[0];
    }
    am.emit('riak', jsonToEmit);
  }
};

/*
 * Heavyweight request probes for Riak queries
 */
RiakProbe.prototype.requestStart = function(probeData, method, methodArgs) {
  probeData.req = request.startRequest('basho-riak-client', 'query', false, probeData.timer);
};

RiakProbe.prototype.requestEnd = function(probeData, method, methodArgs) {
  if (probeData && probeData.req) probeData.req.stop({ method: method });
};

module.exports = RiakProbe;
