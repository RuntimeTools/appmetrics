/*******************************************************************************
 * Copyright 2015 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use that file except in compliance with the License.
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
var am = require('appmetrics');

function MongoProbe() {
	Probe.call(this, 'mongodb');
}
util.inherits(MongoProbe, Probe);

MongoProbe.prototype.aspectCollectionMethod = function(coll, method) {
	var that = this;
    var req;
    aspect.around( coll, method,
        function(target, methodName, methodArgs, probeData) {
			that.metricsProbeStart(probeData, target, method, methodArgs);
			that.requestProbeStart(probeData, target, method, methodArgs);
            if (aspect.findCallbackArg(methodArgs) != undefined) {
                aspect.aroundCallback( methodArgs, probeData, function(target,args, probeData){
                	that.metricsProbeEnd(probeData, method, methodArgs);
                	that.requestProbeEnd(probeData, method, methodArgs);
                } );
            } 
    	},
        function(target, methodName, methodArgs, probeData, rc) {
            if (aspect.findCallbackArg(methodArgs) == undefined) {
            	that.metricsProbeEnd(probeData, method, methodArgs);
            	that.requestProbeEnd(probeData, method, methodArgs);
            }
            return rc;
    	}
    );
}

MongoProbe.prototype.attach = function(name, target) {
	var that = this;
    if( name != "mongodb" ) return target;
    if(target.__ddProbeAttached__) return target;
    target.__ddProbeAttached__ = true;

    var coll = target['Collection'].prototype;
    var method = 'find';
    aspect.around( coll, "find",
        function(target, methodName, methodArgs, probeData){
    		that.metricsProbeStart(probeData, target, method, methodArgs);
    		that.requestProbeStart(probeData, target, method, methodArgs);
    	},
        function(target, methodName, findArgs, probeData, rc){
            if (rc == undefined) {
            	that.metricsProbeEnd(probeData, method, findArgs);
            	that.requestProbeEnd(probeData, method, findArgs);
            } else {
                aspect.before( rc, "toArray", function(target, methodName, args, context){
                    aspect.aroundCallback( args, probeData, function(target, args, probeData){
                    	that.metricsProbeEnd(probeData, method, findArgs);
                    	that.requestProbeEnd(probeData, method, findArgs);
                    });
                });
            }
            return rc;
      });

    that.aspectCollectionMethod(coll, "insert");
    that.aspectCollectionMethod(coll, "save");
    that.aspectCollectionMethod(coll, "update");
    that.aspectCollectionMethod(coll, "remove");
    that.aspectCollectionMethod(coll, "findOne");
    that.aspectCollectionMethod(coll, "count");
    that.aspectCollectionMethod(coll, "findAndModify");
    that.aspectCollectionMethod(coll, "findAndRemove");
    that.aspectCollectionMethod(coll, "aggregate");

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
MongoProbe.prototype.metricsEnd = function(probeData, method, methodArgs) {
	probeData.timer.stop();
	am.emit('mongo', {time: probeData.timer.startTimeMillis, query: JSON.stringify(methodArgs[0]), duration: probeData.timer.timeDelta});
};

/*
 * Heavyweight request probes for MongoDB queries
 */
MongoProbe.prototype.requestStart = function (probeData, target, method, methodArgs) {
	probeData.req = request.startRequest( 'DB', method + "("+target.collectionName+")", false, probeData.timer );
};

MongoProbe.prototype.requestEnd = function (probeData, method, methodArgs) {
	probeData.req.stop( { query: JSON.stringify(methodArgs[0]) } );
};

module.exports = MongoProbe;