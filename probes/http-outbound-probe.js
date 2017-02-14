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
var Probe = require('../lib/probe.js');
var aspect = require('../lib/aspect.js');
var request = require('../lib/request.js');
var util = require('util');
var url = require('url');
var am = require('../');

// Probe to instrument outbound http requests

function HttpOutboundProbe() {    
    Probe.call(this, 'http'); // match the name of the module we're instrumenting
}
util.inherits(HttpOutboundProbe, Probe);

HttpOutboundProbe.prototype.attach = function(name, target) {
    var that = this;
    if( name == 'http' ) {
        if(target.__outboundProbeAttached__) return target;
        target.__outboundProbeAttached__ = true;
       
        aspect.around(target, 'request',
          // Before 'http.request' function
          function(obj, methodName, methodArgs, probeData) {


            // Get HTTP request method from options
            var options = methodArgs[0];
            var requestMethod = "GET";
            var urlRequested= "";
            if(typeof options === 'object') {
                urlRequested = formatURL(options)
                if(options.method) {
                    requestMethod = options.method;
                }
            } else if (typeof options === 'string') {
                urlRequested = options;
                var parsedOptions = url.parse(options);
                if(parsedOptions.method) {
                    requestMethod = parsedOptions.method;
                }
            }

            // Start metrics
            that.metricsProbeStart(probeData, requestMethod, urlRequested);
            that.requestProbeStart(probeData, requestMethod, urlRequested);
          
           // End metrics
           aspect.aroundCallback(methodArgs, probeData, function(target, args, probeData) {
                methodArgs.statusCode = args[0].statusCode
                that.metricsProbeEnd(probeData, requestMethod, urlRequested, args[0]);
                that.requestProbeEnd(probeData, requestMethod, urlRequested, args[0]);
            }, function(target, args, probeData, ret) {
                // Don't need to do anything after the callback
                return ret;
            });
        },
        // After 'http.request' function returns
        function(target, methodName, methodArgs, probeData, rc) {

            // If no callback has been used then end the metrics after returning from the method instead
            if (aspect.findCallbackArg(methodArgs) == undefined) {

                // Need to get request method and URL again
                var options = methodArgs[0];
                var requestMethod = "GET";
                var urlRequested= "";
                if(typeof options === 'object') {
                    urlRequested = formatURL(options)
                    if(options.method) {
                        requestMethod = options.method;
                    }
                } else if (typeof options === 'string') {
                    urlRequested = options;
                    var parsedOptions = url.parse(options);
                    if(parsedOptions.method) {
                        requestMethod = parsedOptions.method;
                    }
                }

                // End metrics (no response available so pass empty object)
                that.metricsProbeEnd(probeData, requestMethod, urlRequested, {});
                that.requestProbeEnd(probeData, requestMethod, urlRequested, {});
            }
            return rc;
        });

    }
    return target;
};

// Get a URL as a string from the options object passed to http.get or http.request
// See https://nodejs.org/api/http.html#http_http_request_options_callback
function formatURL(httpOptions) {
    var url;
    if(httpOptions.protocol) {
       url = httpOptions.protocol
    } else {
        url = "http:"
    }
    url += "//"
    if(httpOptions.auth) {
        url += httpOptions.auth + "@"
    }
    if(httpOptions.host) {
       url += httpOptions.host
    } else  if(httpOptions.hostname) {
       url += httpOptions.host
    } else {
       url += "localhost"
    }
    if(httpOptions.port) {
        url += ":" + httpOptions.port
    }
    if(httpOptions.path) {
        url += httpOptions.path
    } else {
        url += "/"
    }
    return url
}

/*
 * Lightweight metrics probe for HTTP requests
 * 
 * These provide:
 *   time:        time event started
 *   method:      HTTP method, eg. GET, POST, etc
 *   url:         The url requested
 *   duration:    the time for the request to respond
 *   contentType: HTTP content-type
 *   statusCode:  HTTP status code
 */
HttpOutboundProbe.prototype.metricsEnd = function(probeData, method, url, res) {
    probeData.timer.stop();
    am.emit('http-outbound', {time: probeData.timer.startTimeMillis, method: method, url: url, 
        duration: probeData.timer.timeDelta, statusCode: res.statusCode, contentType:res.headers?res.headers['content-type']:"undefined"});
};

/*
 * Heavyweight request probes for HTTP outbound requests
 */
HttpOutboundProbe.prototype.requestStart = function (probeData, method, url) {
    var reqType = 'HTTP Outbound';
    // Do not mark as a root request
    probeData.req = request.startRequest(reqType, url, false, probeData.timer);
};

HttpOutboundProbe.prototype.requestEnd = function (probeData, method, url, res) {
    probeData.req.stop({url: url, statusCode: res.statusCode, contentType:res.headers?res.headers['content-type']:"undefined"});
};


module.exports = HttpOutboundProbe;

