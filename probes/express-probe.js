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
var Probe = require('../lib/probe.js');
var aspect = require('../lib/aspect.js');
var request = require('../lib/request.js');
var util = require('util');
var am = require('../');

function ExpressProbe() {
  Probe.call(this, 'express');
}

util.inherits(ExpressProbe, Probe);

// This method attaches the probe to the instance of the postgres module (target)
ExpressProbe.prototype.attach = function(name, target) {

  var that = this;
  if( name != 'express' ) return target;
  if( target.__ddProbeAttached__ ) return target;
  target.__ddProbeAttached__ = true;

  var applicationMethods = ['checkout', 'copy', 'delete', 'get', 'head', 'lock', 'merge', 'mkactivity',
                            'mkcol', 'move', 'm-search', 'notify', 'options', 'patch', 'post', 'purge', 
                            'put', 'report', 'search', 'subscribe', 'trace', 'unlock', 'unsubscribe'];

  // Get the new target after the express constructor has been called
  var newTarget = aspect.afterConstructor(target, {});

  // Map the application object to the newTarget
  if (newTarget.application) {
    newTarget = newTarget.application;
    
    // Ensure we are only attaching the probe to this target once
    if (!newTarget.__ddProbeAttached__) {
      newTarget.__ddProbeAttached__ = true;

      // Before we make the call to an applicaton method
      aspect.before(newTarget, applicationMethods, function(target, methodName, methodArgs, probeData) {
        
        // Patch the callback - i.e. the user's function when someone vists an application URL
        aspect.aroundCallback(methodArgs, probeData, function(target, args, probeData) {
          that.metricsProbeStart(probeData, methodName, methodArgs);
          that.requestProbeStart(probeData, methodName, methodArgs);

        }, function(target, args, probeData, ret) {
            methodArgs.statusCode = args[1].statusCode;
            that.metricsProbeEnd(probeData, methodName, methodArgs);
            that.requestProbeEnd(probeData, methodName, methodArgs);
        });
      });
    }
  }
  return target;
}

/*
 * Lightweight metrics probe for express queries
 * 
 * These provide:
 *      time:       time event started
 *      url:        the url visited
 *      method:     the HTTP method called
 *      statusCode: the HTTP status code returned
 *      duration:   the time for the request to respond
 */
ExpressProbe.prototype.metricsEnd = function(probeData, methodName, methodArgs) {
  probeData.timer.stop();
  var expressMetrics = {
    time: probeData.timer.startTimeMillis, 
    url: methodArgs[0], 
    method: methodName, 
    statusCode: methodArgs.statusCode, 
    duration: probeData.timer.timeDelta
  }
  am.emit('express', expressMetrics);
};

// Heavyweight request probes for express queries 
ExpressProbe.prototype.requestStart = function (probeData, method, methodArgs) {
  probeData.req = request.startRequest( 'HTTP', 'request', false, probeData.timer );
  probeData.req.setContext({url: methodArgs[0]});
};

ExpressProbe.prototype.requestEnd = function (probeData, method, methodArgs) {
  probeData.req.stop({url: methodArgs[0]});
};

module.exports = ExpressProbe;
