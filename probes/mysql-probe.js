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

/*
* Attach method
* ---------------
* @param name - The name of the npm module
* @param target - The instance of the target module
* @param am - The appmetrics instance
*
* This method attaches our probe to the instance of the mysql module (target)
*
*/
MySqlProbe.prototype.attach = function( name, target, am ) {
	var that = this;
    if( name != "mysql" ) return target;
    target.__ddProbeAttached__ = true;
    
    //After the connection has been created
    //Here, aspect.after calls aspect("after") in aspect.js because of module.exports (exports.after = aspect("after");)
    //This calls the aspect function, which returns another function with the following parameters:
    // target - target
    // meths - 'createConnection'
    // hook1 - function(target,args,rc)...
    // hook2 - null
	aspect.after(target, 'createConnection', function(target, args, rc) {

        //******QUESTION:: How does the args variable get populated?
        //I understand it comes from aspect.js but where does it get defined?

        //Answer: It is an object defined in node containing all the arguments of the current
        //function. Therefore, in aspect.js, the apply method gets called to call the current method with
        //the arguments it requires.

        //But where do the createConnection arguments get passed? Currently, I understand that the apply function
        //is called on createConnection, passing in the arguments (which calls createConnection(arguments));
        //Is that in a test program?

        //Basically, I need to understand how this code gets called from a test program. i.e. how
        //does calling createConnection trigger a probe?

        //So.. create a test program and see what happens.

        console.log("CREATE CONNECTION complete (i think)"+ JSON.stringify(target));
        console.log(JSON.stringify(args));
        console.log(rc);

        //rc looks like the connection object which means "ret" in aspect.js is what is returned form
        //the "apply" function in aspect.js. Calling createConnection on the connection object modifies it.
        //Then, queries are called on this updated connection object hence "rc" being used below.

        // --------------------------------------------------------------------


      
        //Before the query is executed
        //This is where to start probing
        //As this is when the query request hits the mysql database.
        //Before the query is executed, the hookBefore function is called (the one below) to start probing

        //The below code is run EACH TIME there is a query. So we start monitoring for EACH QUERY to the database.

        //I need to figure out how to do this with postgres, given that pg module handles connections to
        //the database differently. Look at mongoDB for starters and compare.

        //Here, monitoring starts when the mysql query hits and ends when the callback returns.

        aspect.before( rc, 'query',
            function(target, methodArgs) {
        		var method = 'query';
        		that.metricsProbeStart(method, methodArgs);
        		that.requestProbeStart(method, methodArgs);
            	if (aspect.findCallbackArg(methodArgs) != undefined) {
            		aspect.aroundCallback( methodArgs, function(target,args){

                        //Here, the query has executed and returned it's callback. Then
                        //stop monitoring
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