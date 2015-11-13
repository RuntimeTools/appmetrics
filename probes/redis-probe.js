/*******************************************************************************
 * Copyright 2015 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * redis://www.apache.org/licenses/LICENSE-2.0
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

/**
 * Probe to instrument the redis npm.
 * 
 * Events are fired for calls to the basic commands either in upper or lower case
 * but are always reported as lower case to keep the two sets of events consistent.
 * 
 * Calls to batch.exec() and multi.exec() are also instrumented. Their events are
 * batch.exec and multi.exec to ensure they can be separately tracked.
 */

function RedisProbe() {
	Probe.call(this, 'redis');
	this.config = {
			filters: []
	};
}
util.inherits(RedisProbe, Probe);

RedisProbe.prototype.attach = function(name, target, am) {
	var that = this;
	if( name != 'redis' ) return;
	if(target.__probeAttached__) return;
	target.__probeAttached__ = true;
	var methods = [];
	[ 'APPEND', 'AUTH', 'BGREWRITEAOF', 'BGSAVE', 'BITCOUNT',
	  'BITOP', 'BITPOS', 'BLPOP', 'BRPOP', 'BRPOPLPUSH', 'CLIENT',
	  'CLUSTER', 'COMMAND', 'CONFIG', 'DBSIZE', 'DEBUG', 'DECR',
	  'DECRBY', 'DEL', 'DISCARD', 'DUMP', 'ECHO', 'EVAL', 'EVALSHA',
	  'EXISTS', 'EXPIRE', 'EXPIREAT', 'FLUSHALL', 'FLUSHDB',
	  'GEOADD', 'GEOHASH', 'GEOPOS', 'GEODIST', 'GEORADIUS',
	  'GEORADIUSBYMEMBER', 'GET', 'GETBIT', 'GETRANGE', 'GETSET', 'HDEL',
	  'HEXISTS', 'HGET', 'HGETALL', 'HINCRBY', 'HINCRBYFLOAT', 'HKEYS',
	  'HLEN', 'HMGET', 'HMSET', 'HSET', 'HSETNX', 'HSTRLEN', 'HVALS',
	  'INCR', 'INCRBY', 'INCRBYFLOAT', 'INFO', 'KEYS', 'LASTSAVE',
	  'LINDEX', 'LINSERT', 'LLEN', 'LPOP', 'LPUSH', 'LPUSHX', 'LRANGE',
	  'LREM', 'LSET', 'LTRIM', 'MGET', 'MIGRATE', 'MONITOR', 'MOVE',
	  'MSET', 'MSETNX', 'OBJECT', 'PERSIST', 'PEXPIRE', 'PEXPIREAT',
	  'PFADD', 'PFCOUNT', 'PFMERGE', 'PING', 'PSETEX', 'PSUBSCRIBE',
	  'PUBSUB', 'PTTL', 'PUBLISH', 'PUNSUBSCRIBE', 'QUIT', 'RANDOMKEY',
	  'RENAME', 'RENAMENX', 'RESTORE', 'ROLE', 'RPOP', 'RPOPLPUSH',
	  'RPUSH', 'RPUSHX', 'SADD', 'SAVE', 'SCARD', 'SCRIPT', 'SDIFF',
	  'SDIFFSTORE', 'SELECT', 'SET', 'SETBIT', 'SETEX', 'SETNX',
	  'SETRANGE', 'SHUTDOWN', 'SINTER', 'SINTERSTORE', 'SISMEMBER',
	  'SLAVEOF', 'SLOWLOG', 'SMEMBERS', 'SMOVE', 'SORT', 'SPOP',
	  'SRANDMEMBER', 'SREM', 'STRLEN', 'SUBSCRIBE', 'SUNION',
	  'SUNIONSTORE', 'SYNC', 'TIME', 'TTL', 'TYPE', 'UNSUBSCRIBE',
	  'UNWATCH', 'WAIT', 'WATCH', 'ZADD', 'ZCARD', 'ZCOUNT', 'ZINCRBY',
	  'ZINTERSTORE', 'ZLEXCOUNT', 'ZRANGE', 'ZRANGEBYLEX',
	  'ZREVRANGEBYLEX', 'ZRANGEBYSCORE', 'ZRANK', 'ZREM',
	  'ZREMRANGEBYLEX', 'ZREMRANGEBYRANK', 'ZREMRANGEBYSCORE',
	  'ZREVRANGE', 'ZREVRANGEBYSCORE', 'ZREVRANK', 'ZSCORE',
	  'ZUNIONSTORE', 'SCAN', 'SSCAN', 'HSCAN', 'ZSCAN' 
	].map(function(m) {
		methods.push(m);
		methods.push(m.toLowerCase());
	});

	/* Instrument the basic set of asynchronous calls.
	 * Emit events before the callbacks are called, if no
	 * callback is passed insert one to end the probe timings.
	 * 
	 */
	methods.map( function( method ) {
		var eventName = method.toLowerCase();
		aspect.before(target.RedisClient.prototype, method, function(target, methodArgs) {
			
			that.metricsProbeStart(eventName, methodArgs);
			that.requestProbeStart(eventName, methodArgs);
			
			/* REDIS commands don't have to have a callback.
			 * All redis calls are asynchronous so we need to instrument or add a
			 * callback to stop the timer.
			 */
			if (aspect.findCallbackArg(methodArgs) != undefined) {
				aspect.aroundCallback( methodArgs, function(target,args) {
					that.metricsProbeEnd(eventName, methodArgs, am);
					that.requestProbeEnd(eventName, methodArgs);
				});
			}
			else {
				// Use the array function push to append to arguments,
				// insert the probeEnd calls directly as the call back.
				[].push.call(methodArgs, function(target,args) {
					that.metricsProbeEnd(eventName, methodArgs, am);
					that.requestProbeEnd(eventName, methodArgs);
				});
			}
		});
	});

	/* Monitor all calls made as one batch/mutli.exec call as a single event.
	 * Instrument the exec method on the object returned from client.batch()
	 * or client.multi()
	 */
	["multi", "batch"].map( function(mode) {
		["EXEC", "exec"].map( function(method) {
			aspect.after(target.RedisClient.prototype, mode, function(target, args, rc) {
				// Log the event name as batch.exec or multi.exec
				var eventName = mode+'.exec';
				aspect.before( rc, method,
						function(target, methodArgs) {
					that.metricsProbeStart(eventName, methodArgs);
					that.requestProbeStart(eventName, methodArgs);
					/* REDIS commands don't have to have a callback.
					 * All redis calls are asynchronous so we need to instrument or add a
					 * callback to stop the timer.
					 */
					var callback = aspect.findCallbackArg(methodArgs);
					if (callback != undefined) {
						aspect.aroundCallback( methodArgs, function(target,args){
							that.metricsProbeEnd(eventName, methodArgs, am);
							that.requestProbeEnd(eventName, methodArgs);
						});
					} else {
						// Use the array function push to append to arguments,
						// insert the probeEnd calls directly as the call back.
						[].push.call(methodArgs, function(target,args) {
							that.metricsProbeEnd(eventName, methodArgs, am);
							that.requestProbeEnd(eventName, methodArgs);
						});
					}
				});
				return rc;
			});
		});
	});
	return target;
};

/*
 * Lightweight metrics probe for REDIS requests
 * 
 * These provide:
 * 		time:		time event started
 * 		method:		REDIS method, eg. GET, SET, INCR, etc
 * 		args:		The args passed in
 * 		duration:	the time for the request to respond
 */

RedisProbe.prototype.metricsEnd = function(method, args, am, str) {
	am.emit('redis', {time: start, method: method, args: args, duration: Date.now() - start});
};

/*
 * Heavyweight request probes for REDIS requests
 * TODO: Make these work for REDIS commands
 */

RedisProbe.prototype.requestStart = function (traceUrl, res, am) {
    var reqType = 'REDIS';
    // Mark as a root request as this happens due to an external event
    tr = request.startRequest(reqType, traceUrl, true);
};

RedisProbe.prototype.requestEnd = function (req, res, am) {
	var reqUrl = url.parse( req.url, true ).pathname;
    tr.stop({url: reqUrl });
};
	
module.exports = RedisProbe;
