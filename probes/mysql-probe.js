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

function MySqlProbe() {
	Probe.call(this, 'mysql');
}
util.inherits(MySqlProbe, Probe);

MySqlProbe.prototype.attach = function( name, target, am ) {
	var that = this;
    if( name != "mysql" ) return target;
    target.__ddProbeAttached__ = true;
    
	aspect.after(target, 'createConnection', function(target, args, rc) {
        aspect.before( rc, 'query',
            function(target, methodArgs) {
        		var method = 'query';
        		that.metricsProbeStart(method, methodArgs);
        		that.requestProbeStart(method, methodArgs);
            	if (aspect.findCallbackArg(methodArgs) != undefined) {
            		aspect.aroundCallback( methodArgs, function(target,args){
            			that.metricsProbeEnd(method, methodArgs, am);
            			that.requestProbeEnd(method, methodArgs);
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
MySqlProbe.prototype.metricsEnd = function(method, methodArgs, am) {
	am.emit('mysql', {time: start, query: JSON.stringify(methodArgs[0]), duration: this.getDuration()});
};

/*
 * Heavyweight request probes for MySQL queries
 */
MySqlProbe.prototype.requestStart = function (method, methodArgs) {
	req = request.startRequest( 'DB', "query" );
	req.setContext({sql: JSON.stringify(methodArgs[0])});
};

MySqlProbe.prototype.requestEnd = function (method, methodArgs) {
	req.stop({sql: JSON.stringify(methodArgs[0])});
};

module.exports = MySqlProbe;