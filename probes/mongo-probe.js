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

function MongoProbe() {
	Probe.call(this, 'mongodb');
}
util.inherits(MongoProbe, Probe);

MongoProbe.prototype.aspectCollectionMethod = function(coll, method, am) {
	var that = this;
    var req;
    aspect.around( coll, method,
        function(target, methodArgs) {
			that.metricsProbeStart(target, method, methodArgs);
			that.requestProbeStart(target, method, methodArgs);
            if (aspect.findCallbackArg(methodArgs) != undefined) {
                aspect.aroundCallback( methodArgs, function(target,args){
                	that.metricsProbeEnd(method, methodArgs, am);
                	that.requestProbeEnd(method, methodArgs);
                } );
            } 
    },
        function(target, methodArgs, rc) {
            if (aspect.findCallbackArg(methodArgs) == undefined) {
            	that.metricsProbeEnd(method, methodArgs, am);
            	that.requestProbeEnd(method, methodArgs);
            }
            return rc;
    	}
    );
}

MongoProbe.prototype.attach = function( name, target, am ) {
	var that = this;
    if( name != "mongodb" ) return target;
    if(target.__ddProbeAttached__) return target;
    target.__ddProbeAttached__ = true;

    var coll = target['Collection'].prototype;
    var method = 'find';
    aspect.around( coll, "find",
        function(target, methodArgs){
    		that.metricsProbeStart(target, method, methodArgs, am);
    		that.requestProbeStart(target, method, methodArgs, am);
    	},
        function(target, findArgs, rc){
            if (rc == undefined) {
            	that.metricsProbeEnd(method, findArgs, am);
            	that.requestProbeEnd(method, findArgs, am);
            } else {
                aspect.before( rc, "toArray", function(target, args){
                    aspect.aroundCallback( args, function(target, args){
                    	that.metricsProbeEnd(method, findArgs, am);
                    	that.requestProbeEnd(method, findArgs, am);
                    });
                });
            }
            return rc;
      });

    that.aspectCollectionMethod(coll, "insert", am);
    that.aspectCollectionMethod(coll, "save", am);
    that.aspectCollectionMethod(coll, "update", am);
    that.aspectCollectionMethod(coll, "remove", am);
    that.aspectCollectionMethod(coll, "findOne", am);
    that.aspectCollectionMethod(coll, "count", am);
    that.aspectCollectionMethod(coll, "findAndModify", am);
    that.aspectCollectionMethod(coll, "findAndRemove", am);
    that.aspectCollectionMethod(coll, "aggregate", am);

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
MongoProbe.prototype.metricsEnd = function(method, methodArgs, am) {
	am.emit('mongo', {time: start, query: JSON.stringify(methodArgs[0]), duration: this.getDuration()});
};

/*
 * Heavyweight request probes for MongoDB queries
 */
MongoProbe.prototype.requestStart = function (target, method, methodArgs, am) {
	req = request.startRequest( 'DB', method + "("+target.collectionName+")" );
	req.setContext( { query: JSON.stringify(methodArgs[0]) } );
};

MongoProbe.prototype.requestEnd = function (method, methodArgs, am) {
	req.stop( { query: JSON.stringify(methodArgs[0]) } );
};

module.exports = MongoProbe;