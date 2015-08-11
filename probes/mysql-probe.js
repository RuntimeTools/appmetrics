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

exports.name = 'mysql';
exports.attach = function( name, target, hc ) {
    if( name != "mysql" ) return target;
    target.__ddProbeAttached__ = true;
    
	aspect.after(target, 'createConnection', function(target, args, rc) {
        aspect.before( rc, 'query',
            function(target, methodArgs) {
        	    var req;
        		var method = 'query';
        		metricsProbeStart(method, methodArgs, hc);
        		requestProbeStart(method, methodArgs, hc);
            	if (aspect.findCallbackArg(methodArgs) != undefined) {
            		aspect.aroundCallback( methodArgs, function(target,args){
            			metricsProbeEnd(method, methodArgs, hc);
            			requestProbeEnd(method, methodArgs, hc);
            		});
            	};
            }
        );
        return rc;
    });
    return target;
};

/*
 * Lightweight metrics probe for MySQL queries
 * 
 * These provide:
 * 		time:		time event started
 * 		query:		The SQL executed
 * 		duration:	the time for the request to respond
 */
var metricsStart = function(method, methodArgs, hc) {
	start = Date.now();
};

var metricsEnd = function(method, methodArgs, hc) {
	hc.emit('mysql', {time: start, query: JSON.stringify(methodArgs[0]), duration: Date.now() - start});
};

/*
 * Heavyweight request probes for MySQL queries
 */
var request = require('../lib/request.js');

var requestStart = function (method, methodArgs, hc) {
	start = Date.now();
	req = request.startRequest( 'DB', "query" );
	req.setContext({sql: JSON.stringify(methodArgs[0])});
};

var requestEnd = function (method, methodArgs, hc) {
	req.stop({sql: JSON.stringify(methodArgs[0])});
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
	metricsProbeStart = metricsStart;
	metricsProbeEnd = metricsEnd;
};

exports.disable = function() {
	metricsProbeStart = function() {};
	metricsProbeEnd = function() {};
};

var config = {
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
};