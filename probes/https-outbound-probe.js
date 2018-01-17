/*******************************************************************************
 * Copyright 2017 IBM Corp.
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

var am = require('../');
var aspect = require('../lib/aspect.js');
var Probe = require('../lib/probe.js');
var request = require('../lib/request.js');

var url = require('url');
var util = require('util');
var semver = require('semver');

var methods;
// In Node.js < v9.0.0 'get' calls 'request' so we only instrument 'request'
if (semver.lt(process.version, '9.0.0')) {
  methods = ['request'];
} else {
  methods = ['request', 'get'];
}

// Probe to instrument outbound https requests
function HttpsOutboundProbe() {
  Probe.call(this, 'https'); // match the name of the module we're instrumenting
}
util.inherits(HttpsOutboundProbe, Probe);

function getRequestItems(options) {
  var returnObject = { requestMethod: 'GET', urlRequested: '', headers: '' };
  if (options !== null) {
    var parsedOptions;
    switch (typeof options) {
      case 'object':
        returnObject.urlRequested = formatURL(options);
        parsedOptions = options;
        break;
      case 'string':
        returnObject.urlRequested = options;
        parsedOptions = url.parse(options);
        break;
    }
    if (parsedOptions.method) { returnObject.requestMethod = parsedOptions.method; }
    if (parsedOptions.headers) { returnObject.headers = parsedOptions.headers; }
  }
  return returnObject;
}

HttpsOutboundProbe.prototype.attach = function(name, target) {
  var that = this;
  if (name === 'https') {
    if (target.__outboundProbeAttached__) return target;
    target.__outboundProbeAttached__ = true;

    aspect.around(
      target,
      methods,
      // Before 'https.request' function
      function(obj, methodName, methodArgs, probeData) {

        // Start metrics
        that.metricsProbeStart(probeData);
        that.requestProbeStart(probeData);

        // End metrics
        aspect.aroundCallback(
          methodArgs,
          probeData,
          function(target, args, probeData) {

            // Get HTTPS request method from options
            var ri = getRequestItems(methodArgs[0]);
            that.metricsProbeEnd(probeData, ri.requestMethod, ri.urlRequested, args[0], ri.headers);
            that.requestProbeEnd(probeData, ri.requestMethod, ri.urlRequested, args[0], ri.headers);
          },
          function(target, args, probeData, ret) {
            // Don't need to do anything after the callback
            return ret;
          }
        );
      },
      // After 'https.request' function returns
      function(target, methodName, methodArgs, probeData, rc) {
        // If no callback has been used then end the metrics after returning from the method instead
        if (aspect.findCallbackArg(methodArgs) === undefined) {
          // Need to get request method and URL again
          var ri = getRequestItems(methodArgs[0]);
          // End metrics (no response available so pass empty object)
          that.metricsProbeEnd(probeData, ri.requestMethod, ri.urlRequested, {}, ri.headers);
          that.requestProbeEnd(probeData, ri.requestMethod, ri.urlRequested, {}, ri.headers);
        }
        return rc;
      }
    );
  }
  return target;
};

// Get a URL as a string from the options object passed to https.get or https.request
// See https://nodejs.org/api/http.html#http_http_request_options_callback
function formatURL(httpsOptions) {
  var url;
  if (httpsOptions.protocol) {
    url = httpsOptions.protocol;
  } else {
    url = 'https:';
  }
  url += '//';
  if (httpsOptions.auth) {
    url += httpsOptions.auth + '@';
  }
  if (httpsOptions.host) {
    url += httpsOptions.host;
  } else if (httpsOptions.hostname) {
    url += httpsOptions.hostname;
  } else {
    url += 'localhost';
  }
  if (httpsOptions.port && !url.includes(':' + httpsOptions.port)) {
    url += ':' + httpsOptions.port;
  }
  if (httpsOptions.path) {
    url += httpsOptions.path;
  } else {
    url += '/';
  }
  return url;
}

/*
 * Lightweight metrics probe for HTTPS requests
 *
 * These provide:
 *   time:            time event started
 *   method:          HTTPS method, eg. GET, POST, etc
 *   url:             The url requested
 *   requestHeaders:  The HTTPS headers for the request
 *   duration:        The time for the request to respond
 *   contentType:     HTTPS content-type
 *   statusCode:      HTTPS status code
 */
HttpsOutboundProbe.prototype.metricsEnd = function(probeData, method, url, res, headers) {
  if (probeData && probeData.timer) {
    probeData.timer.stop();
    am.emit('https-outbound', {
      time: probeData.timer.startTimeMillis,
      method: method,
      url: url,
      duration: probeData.timer.timeDelta,
      statusCode: res.statusCode,
      contentType: res.headers ? res.headers['content-type'] : undefined,
      requestHeaders: headers,
    });
  }
};

/*
 * Heavyweight request probes for HTTPS outbound requests
 */
HttpsOutboundProbe.prototype.requestStart = function(probeData, method, url) {
  var reqType = 'https-outbound';
  // Do not mark as a root request
  probeData.req = request.startRequest(reqType, url, false, probeData.timer);
};

HttpsOutboundProbe.prototype.requestEnd = function(probeData, method, url, res, headers) {
  if (probeData && probeData.req)
    probeData.req.stop({
      url: url,
      statusCode: res.statusCode,
      contentType: res.headers ? res.headers['content-type'] : undefined,
      requestHeaders: headers,
    });
};

module.exports = HttpsOutboundProbe;
