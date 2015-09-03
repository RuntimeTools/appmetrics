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
var url = require('url');

function HttpProbe() {
	Probe.call(this, 'http');
	this.config = {
			filters: []
	};
}
util.inherits(HttpProbe, Probe);

HttpProbe.prototype.attach = function(name, target, am) {
	var that = this;
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
	            var traceUrl = that.filterUrl(req);
	            if (traceUrl !== '') {
	            	that.metricsProbeStart(req, res);
	            	that.requestProbeStart(traceUrl, res);
	            	aspect.after(res, 'end',function(obj, args, ret) {
	            		if (traceUrl !== '') {
	            			that.metricsProbeEnd(req, res, am);
	            			that.requestProbeEnd(req, res);
	            		}
	            	});
	            }
	        });
	    });		
	}	
	return target;
};

/*
 * Ignore requests for URLs which we've been configured via regex to ignore
 */
HttpProbe.prototype.filterUrl = function(req) {
    var resultUrl = url.parse( req.url, true ).pathname;
    var filters = this.config.filters;
    if (filters.length == 0) return resultUrl;
    
    var identifier = req.method + ' ' + resultUrl;
    for (var i = 0; i < filters.length; ++i) {
        var filter = filters[i];
        if (filter.regex.test(identifier)) {
            return filter.to;
        }
    }
    return resultUrl;
}

/*
 * Lightweight metrics probe for HTTP requests
 * 
 * These provide:
 * 		time:		time event started
 * 		method:		HTTP method, eg. GET, POST, etc
 * 		url:		The url requested
 * 		duration:	the time for the request to respond
 */

HttpProbe.prototype.metricsEnd = function(req, res, am) {
	am.emit('http', {time: start, method: req.method, url: req.url, duration: Date.now() - start});
};

/*
 * Heavyweight request probes for HTTP requests
 */

HttpProbe.prototype.requestStart = function (traceUrl, res, am) {
    var reqType = 'HTTP';
    // Mark as a root request as this happens due to an external event
    tr = request.startRequest(reqType, traceUrl, true);
};

HttpProbe.prototype.requestEnd = function (req, res, am) {
	var reqUrl = url.parse( req.url, true ).pathname;
    tr.stop({url: reqUrl });
};
	
/*
 * Set configuration by merging passed in config with current one
 */
HttpProbe.prototype.setConfig = function (newConfig) {
	if (typeof(newConfig.filters) !== 'undefined') {
		newConfig.filters.forEach(function(filter) {
			if (typeof(filter.regex) === 'undefined') {
				filter.regex = new RegExp(filter.pattern);
			}
		});
	}
	for (var prop in newConfig) {
		if (typeof(newConfig[prop]) !== 'undefined') {
			this.config[prop] = newConfig[prop];
		}
	}
};

module.exports = HttpProbe;