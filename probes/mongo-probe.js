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

function aspectCollectionMethod(coll, method, hc) {
    var req;
    aspect.around( coll, method,
        function(target, methodArgs) {
			metricsProbeStart(target, method, methodArgs, hc);
			requestProbeStart(target, method, methodArgs, hc);
            if (aspect.findCallbackArg(methodArgs) != undefined) {
                aspect.aroundCallback( methodArgs, function(target,args){
                	metricsProbeEnd(method, methodArgs, hc);
                	requestProbeEnd(method, methodArgs, hc);
                } );
            } 
    },
        function(target, methodArgs, rc) {
            if (aspect.findCallbackArg(methodArgs) == undefined) {
            	metricsProbeEnd(method, methodArgs, hc);
            	requestProbeEnd(method, methodArgs, hc);
            }
            return rc;
    	}
    );
}

exports.name = 'mongodb';
exports.attach = function( name, target, hc ) {
    if( name != "mongodb" ) return target;
    if(target.__ddProbeAttached__) return target;
    target.__ddProbeAttached__ = true;

    var coll = target['Collection'].prototype;
    var req;
    var method = 'find';
    aspect.around( coll, "find",
        function(target, methodArgs){
    		metricsProbeStart(target, method, methodArgs, hc);
    		requestProbeStart(target, method, methodArgs, hc);
    	},
        function(target, findArgs, rc){
            if (rc == undefined) {
            	metricsProbeEnd(method, findArgs, hc);
            	requestProbeEnd(method, findArgs, hc);
            } else {
                aspect.before( rc, "toArray", function(target, args){
                    aspect.aroundCallback( args, function(target, args){
                    	metricsProbeEnd(method, findArgs, hc);
                    	requestProbeEnd(method, findArgs, hc);
                    });
                });
            }
            return rc;
      });

    aspectCollectionMethod(coll, "insert", hc);
    aspectCollectionMethod(coll, "save", hc);
    aspectCollectionMethod(coll, "update", hc);
    aspectCollectionMethod(coll, "remove", hc);
    aspectCollectionMethod(coll, "findOne", hc);
    aspectCollectionMethod(coll, "count", hc);
    aspectCollectionMethod(coll, "findAndModify", hc);
    aspectCollectionMethod(coll, "findAndRemove", hc);
    aspectCollectionMethod(coll, "aggregate", hc);

    return target;

};

/*
 * Lightweight metrics probe for MongoDB queries
 * 
 * These provide:
 * 		time:		time event started
 * 		query:		the query itself
 * 		duration:	the time for the request to respond
 */
var metricsStart = function(target, method, methodArgs, hc) {
	start = Date.now();
};

var metricsEnd = function(method, methodArgs, hc) {
	hc.emit('mongo', {time: start, query: JSON.stringify(methodArgs[0]), duration: Date.now() - start});
};

/*
 * Heavyweight request probes for MonngoDB queries
 */
var request = require('../lib/request.js');

var requestStart = function (target, method, methodArgs, hc) {
	start = Date.now();
	req = request.startRequest( 'DB', method + "("+target.collectionName+")" );
	req.setContext( { query: JSON.stringify(methodArgs[0]) } );
};

var requestEnd = function (method, methodArgs, hc) {
	req.stop( { query: JSON.stringify(methodArgs[0]) } );
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