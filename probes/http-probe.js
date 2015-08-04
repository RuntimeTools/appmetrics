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

var aspect = require('../lib/aspect.js');
var url = require('url');

/*
 * Ignore requests for URLs which we've been configured via regex to ignore
 */
function filterUrl(req) {
    var resultUrl = url.parse( req.url, true ).pathname;
    var identifier = req.method + ' ' + resultUrl;
    var filters = config.filters;
    for (var i = 0; i < filters.length; ++i) {
        var filter = filters[i];
        if (filter.regex.test(identifier)) {
            return filter.to;
        }
    }
    return resultUrl;
}

exports.name = 'http';
exports.attach = function(name, target, hc) {
	if( name == 'http' ) {
		if(target.__probeAttached__) return;
	    target.__probeAttached__ = true;
	    var methods = ['on', 'addListener'];
	    var start;
	    aspect.before(target.Server.prototype, methods,
	      function(obj, args) {
	        if(args[0] !== 'request') return;
	        if(obj.__httpProbe__) return;
	        obj.__httpProbe__ = true;
	        aspect.aroundCallback(args, function(obj, args) {
	            var req = args[0];
	            var res = args[1];
	            var reqDomain;
	            var tr;
	            // Filter out urls where filter.to is ''
	            var traceUrl = filterUrl(req);
	            if (traceUrl !== '') {
	            	metricsProbeStart(req, res, hc);
	            	requestProbeStart(req, res, hc);
	            }
	            aspect.after(res, 'end',function(obj, args, ret) {
	            	if (traceUrl !== '') {
	            		metricsProbeEnd(req, res, hc);
	            		requestProbeEnd(req, res, hc);
	            	}
	            });
	        });
	    });		
	}	
	return target;
};

/*
 * Lightweight metrics probe for HTTP requests
 * 
 * These provide:
 * 		time:		time event started
 * 		method:		HTTP method, eg. GET, POST, etc
 * 		url:		The url requested
 * 		duration:	the time for the request to respond
 */
var metricsStart = function(req, res, hc) {
	start = Date.now();
};

var metricsEnd = function(req, res, hc) {
	hc.emit('http', {time: start, method: req.method, url: req.url, duration: Date.now() - start});
};

/*
 * Heavyweight request probes for HTTP requests
 */
var request = require('../lib/request.js');

var requestStart = function (req, res, hc) {
    start = Date.now();
    var reqType = 'HTTP';
    var reqUrl = url.parse( req.url, true ).pathname;
    // Mark as a root request as this happens due to an external event
    tr = request.startRequest(reqType, reqUrl, true);
    tr.setContext({url: reqUrl }); 
};

var requestEnd = function (req, res, hc) {
	var reqUrl = url.parse( req.url, true ).pathname;
    tr.stop({url: reqUrl });
};

/*
 * Default to metrics on
 */
var metricsProbeStart = metricsStart;
var metricsProbeEnd = metricsEnd;

/*
 * Default to requests off
 */
var requestProbeStart = function () {};
var requestProbeEnd = function () {};

exports.enableRequests = function() {
	requestProbeStart = requestStart;
	requestProbeEnd = requestEnd;
}

exports.disableRequests = function() {
	requestProbeStart = function () {};
	requestProbeEnd = function () {};
}

exports.enable = function() {
	probeFunctionStart = lightweightProbeStart;
	probeFunctionEnd = lightweightProbeEnd;
};

exports.disable = function() {
	probeFunctionStart = function() {};
	probeFunctionEnd = function() {};
};

var config = {
		filters: []
};
	
/*
 * Set configuration by merging passed in config with current one
 */
exports.setConfig = function (newConfig) {
	for (var prop in newConfig) {
		if (typeof(newConfig[prop]) !== 'undefined') {
			config[prop] = newConfig[prop];
		}
	}
	config.filters.forEach(function(filter) {
		if (typeof(filter.regex) === 'undefined') {
			filter.regex = new RegExp(filter.pattern);
		}
	});
};
