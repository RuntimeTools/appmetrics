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
var am = require('appmetrics');

function PostgresProbe() {
	Probe.call(this, 'pg');
}
util.inherits(PostgresProbe, Probe);


/*
* Attach method
* ---------------
* @param name - The name of the npm module
* @param target - The instance of the target module
* @param am - The appmetrics instance
*
* This method attaches our probe to the instance of the postgres module (target)
* A sample postgres query has the following format:
* 
* var pg = require('pg');
* var conString = "postgres://user:password@host/database";
*
* var client = new pg.Client(conString);
*
* client.connect(function(err) {
*   if(err) {
*       return err;
*   }
*   client.query("SELECT *",function(err,result) {
*    
*       //result is the result of the sql query.
*   }
* }
*
* So, we need to access the client variable in order to monitor queries to the client.
* After a connection has been established, we start monitoring for any SQL queries
* using the 'query' method.
*
*/
PostgresProbe.prototype.attach = function( name, target, am ) {

	var that = this;
    if( name != "pg" ) return target;
    if(target.__ddProbeAttached__) return target;
    target.__ddProbeAttached__ = true;

    //After the client has been instantiated
    var data = {};
    aspect.after(target, 'Client', data, function(clientTarget, methodName, methodArgs, probeData, rc) {

        //After a connection has been established on the client
        aspect.after(clientTarget, 'connect', data, function(connectionTarget, methodName, args, probeData, rc) {
                       
            //Before the query hits, start monitoring
            aspect.before(connectionTarget, 'query',
                function(target, methodName, methodArgs, probeData) {
                    var method = 'query';
                    that.metricsProbeStart(probeData, target, method, methodArgs);
                    that.requestProbeStart(probeData, target, method, methodArgs);
                    if (aspect.findCallbackArg(methodArgs) != undefined) {
                        aspect.aroundCallback(methodArgs, probeData, function(target,args,probeData){

                            //Here, the query has executed and returned it's callback. Then
                            //stop monitoring
                            that.metricsProbeEnd(probeData, method, methodArgs);
                            that.requestProbeEnd(probeData, method, methodArgs);
                        });
                    };
                }
            );
            return rc;
        });
    });
    return target;
};


/*
 * Lightweight metrics probe for Postgres queries
 * 
 * These provide:
 * 		time:		time event started
 * 		query:		The SQL executed
 * 		duration:	the time for the request to respond
 */
PostgresProbe.prototype.metricsEnd = function(probeData, method, methodArgs) {
	probeData.timer.stop();
    am.emit('postgres', {time: probeData.timer.startTimeMillis, query: methodArgs[0], duration: probeData.timer.timeDelta});
};

/*
 * Heavyweight request probes for Postgres queries
 */
PostgresProbe.prototype.requestStart = function (probeData, target, method, methodArgs) {
    probeData.req = request.startRequest( 'DB', "query", false, probeData.timer );
    probeData.req.setContext({sql: methodArgs[0]});
};

PostgresProbe.prototype.requestEnd = function (probeData, method, methodArgs) {
	probeData.req.stop({sql: methodArgs[0]});
};

module.exports = PostgresProbe;