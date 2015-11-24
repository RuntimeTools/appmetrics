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
var am = require('appmetrics');

/**
 * Probe to instrument the MQLight npm client
 */
function MQLightProbe() {
	Probe.call(this, 'mqlight');
}
util.inherits(MQLightProbe, Probe);

MQLightProbe.prototype.attach = function(name, target) {
	var that = this;
	if( name != 'mqlight' ) return target;
	if(target.__probeAttached__) return;
	target.__probeAttached__ = true;

	// Before any calls to 'createClient'
	aspect.before(target, 'createClient', function(target, methodName, methodArgs, probeData) {
		// Start the monitoring for 'createClient'
		that.metricsProbeStart(probeData);
		that.requestProbeStart(probeData, 'createClient', methodArgs);
		// After the MQLight Client has been created
		if (aspect.findCallbackArg(methodArgs) == undefined) {
			// Push an empty callback so we can advise it
			[].push.call(methodArgs, function(target, args) {});
		}
		aspect.aroundCallback(methodArgs, probeData, function(target, args, probeData){
			var error = args[0];
			var thisClient = args[1];
			// End the monitoring for 'createClient'
			that.metricsProbeEnd(probeData, 'createClient', methodArgs, thisClient);
			that.requestProbeEnd(probeData, 'createClient', methodArgs, thisClient);
		});
	});

	// After 'createClient'
	aspect.after(target, 'createClient', {}, function(target, methodName, createClientArgs, context, rc) {
		var thisClient = rc; // the MQLight client that was created
		var methods = ['send', 'on', 'start', 'stop', 'subscribe'];
		// Before one of the above methods is called on the client
		aspect.before(thisClient, methods, function(target, methodName, args, probeData) {
			// Start the monitoring for the method
			that.metricsProbeStart(probeData, methodName, args);
			that.requestProbeStart(probeData, methodName, args);
			// Find the callback for the method
			if (aspect.findCallbackArg(args) == undefined) {
				// If there is no callback, push an empty one so that we can advise it
				[].push.call(args, function(target, args) {});
			}
			aspect.aroundCallback(args, probeData, function(target, callbackArgs, probeData){
				// method has completed and the callback has been called, so end the monitoring
				that.metricsProbeEnd(probeData, methodName, args, thisClient);
				that.requestProbeEnd(probeData, methodName, args, thisClient);
			});
		});
		return rc;
	});
	return target;
};

/*
 * Lightweight metrics probe for MQLight messages
 * 
 * These provide:
 * 		method:		The name of the MQLight function that has been called
 * 		methodArgs:	The arguments to the call
 * 		client:		The associated client
 */
MQLightProbe.prototype.metricsEnd = function(probeData, method, methodArgs, client) {
	probeData.timer.stop();
	if(method == 'send') {
		var data = methodArgs[1];
		if(data.length > 25) {
			data = data.substring(0, 22) + "...";	
		}
		var options; // options are optional - check number of arguments.
		if(methodArgs.length > 3) {
			options = methodArgs[2];
		}
		am.emit('mqlight', {time: probeData.timer.startTimeMillis, method: method, topic: methodArgs[0], data: data, options : options, 
			duration: probeData.timer.timeDelta, clientid: client.id});
	} else if (method == 'subscribe') {
		am.emit('mqlight', {time: probeData.timer.startTimeMillisstartTimeMillis, method: method, topicPattern: methodArgs[0], 
			duration: probeData.timer.startTimeMillistimeDelta, clientid: client.id});
	} else {
		am.emit('mqlight', {time: probeData.timer.startTimeMillisstartTimeMillis, method: method, duration: probeData.timer.timeDelta, clientid: client.id})
	}
};

/*
 * Heavyweight request probes for MQLight messages
 */
MQLightProbe.prototype.requestStart = function (probeData, method, methodArgs) {
	probeData.req = request.startRequest('MQLight', method, true, probeData.timer);
};

MQLightProbe.prototype.requestEnd = function (probeData, method, methodArgs, client) {
	if(method == 'send') {
		var data = methodArgs[1];
		var options; // options are optional - check number of arguments.
		if(methodArgs.length > 3) {
			options = methodArgs[2];
		}
		probeData.req.stop({method: method,  topic: methodArgs[0], clientid: client.id, data: data, options: options});
	} else if (method == 'subscribe') {
		probeData.req.stop({method: method,  topicPattern: methodArgs[0], clientid: client.id});
	} else {
		probeData.req.stop({method: method, clientid: client.id});
	}
};

module.exports = MQLightProbe;