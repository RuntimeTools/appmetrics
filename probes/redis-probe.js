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
var am = require('appmetrics');
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
}
util.inherits(RedisProbe, Probe);

RedisProbe.prototype.attach = function(name, target) {
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
	 */
//	aspect.before(target.RedisClient.prototype, methods, function(target, method, methodArgs, probeData) {
//		var eventName = method.toLowerCase();
//		that.metricsProbeStart(probeData, eventName, methodArgs);
//		that.requestProbeStart(probeData, eventName, methodArgs);
//		/* REDIS commands don't have to have a callback.
//		 * All redis calls are asynchronous so we need to instrument or add a
//		 * callback to stop the timer.
//		 */
//		if (aspect.findCallbackArg(methodArgs) != undefined) {
//			aspect.aroundCallback( methodArgs, probeData, function(target, args) {
//				that.metricsProbeEnd(probeData, eventName, methodArgs);
//				that.requestProbeEnd(probeData, eventName, methodArgs);
//			});
//		} else {
//			// Use the array function push to append to arguments,
//			// insert the probeEnd calls directly as the call back.
//			[].push.call(methodArgs, function(target, args) {
//				that.metricsProbeEnd(probeData, eventName, methodArgs);
//				that.requestProbeEnd(probeData, eventName, methodArgs);
//			});
//		}
//
//	});
	aspect.around(target.RedisClient.prototype, methods, function(target, method, methodArgs, probeData) {
		var eventName = method.toLowerCase();
		that.metricsProbeStart(probeData, eventName, methodArgs);
		that.requestProbeStart(probeData, eventName, methodArgs);
		/* REDIS commands don't have to have a callback.
		 * All redis calls are asynchronous so we need to instrument or add a
		 * callback to stop the timer.
		 */
		if (aspect.findCallbackArg(methodArgs) != undefined) {
			aspect.aroundCallback( methodArgs, probeData, function(target, args) {
				that.metricsProbeEnd(probeData, eventName, methodArgs);
				that.requestProbeEnd(probeData, eventName, methodArgs);
			});
		}
//		else {
			// Inserting a callback gives us consistent timings between calls that
			// pass a callback and those that don't. All redis commands can take a
			// callback so should be safe to do.
			// However this is not true for other npm modules where inserting a callback
			// may change behaviour and hence not for other probes so there is a choice
			// between being consistent with the behaviour for other redis calls or other
			// probes.
			// We have chosen to be consistent with other probes but uncomment the code
			// below, comment out the after function and change this from aspect.around
			// to aspect.before to change the behaviour.
			// TODO - Verify this metric is more use to end users.
//			// Use the array function push to append to arguments,
//			// insert the probeEnd calls directly as the call back.
//			[].push.call(methodArgs, function(target, args) {
//				that.metricsProbeEnd(probeData, eventName, methodArgs);
//				that.requestProbeEnd(probeData, eventName, methodArgs);
//			});
//		}

	}, function(target, method, methodArgs, probeData, rc) {
		if (aspect.findCallbackArg(methodArgs) == undefined) {
			var eventName = method.toLowerCase();
			that.metricsProbeEnd(probeData, eventName, methodArgs);
			that.requestProbeEnd(probeData, eventName, methodArgs);
		}
	});

	/* Monitor all calls made as one batch/multi.exec call as a single event.
	 * Instrument the exec method on the object returned from client.batch()
	 * or client.multi()
	 */
	aspect.after(target.RedisClient.prototype, ['multi', 'batch'], {}, function(target, mode, args, probeData, client) {
		// Log the event name as batch.exec or multi.exec
		var eventName = mode+'.exec';
		aspect.around( client, ['exec', 'EXEC'],
				function(target, method, methodArgs, probeData) {
			that.metricsProbeStart(probeData, eventName, methodArgs);
			that.requestProbeStart(probeData, eventName, methodArgs);
			/* REDIS commands don't have to have a callback.
			 * All redis calls are asynchronous so we need to instrument or add a
			 * callback to stop the timer.
			 */
			var callback = aspect.findCallbackArg(methodArgs);
			if (callback != undefined) {
				aspect.aroundCallback( methodArgs, probeData, function() {
					that.metricsProbeEnd(probeData, eventName, methodArgs);
					that.requestProbeEnd(probeData, eventName, methodArgs);
				});
			}
//			else {
//				// Use the array function push to append to arguments,
//				// insert the probeEnd calls directly as the call back.
//				[].push.call(methodArgs, function() {
//					that.metricsProbeEnd(probeData, eventName, methodArgs);
//					that.requestProbeEnd(probeData, eventName, methodArgs);
//				});
//			}
		}, function(target, method, methodArgs, probeData, rc) {
			if (aspect.findCallbackArg(methodArgs) == undefined) {
				that.metricsProbeEnd(probeData, eventName, methodArgs);
				that.requestProbeEnd(probeData, eventName, methodArgs);
			}
		});
		return client;
	});
	return target;
};

function truncateArgsArray(methodArgs) {
	var argCount = 0;
	var argsArray = [];
	/* Arguments to redis commands can be either an array of arguments followed by
	 * a callback or a variable number of args followed by a callback.
	 * The callback is optional.
	 */
	if(Array.isArray(methodArgs[0])) {
		methodArgs = methodArgs[0];
	}
	for( var index in methodArgs ) {
		var arg = methodArgs[index];
		
		// Have reached callback. (All preceding arguments *should* be strings.)
		if( typeof arg === 'function' ) {
			break;
		}
		// Truncate at 10 arguments.
		if( argCount == 10 ) {
			break;
		}
		
		// Make sure we truncate strings.
		if( typeof arg === 'string') {
			if(arg.length > 25) {
				arg = arg.substring(0, 22) + '...';
			}
		}
		argsArray.push(arg);
		argCount++;
	}
	if( methodArgs.length > 10 ) {
		argsArray.push('...');
	}
	return argsArray;
}

/*
 * Lightweight metrics probe for REDIS requests
 * 
 * These provide:
 * 		time:		time event started
 * 		cmd:		REDIS method, eg. GET, SET, INCR, etc
 * 		args:		The args passed in (truncated)
 * 		duration:	the time for the request to respond
 */

RedisProbe.prototype.metricsEnd = function(probeData, cmd, methodArgs) {
	probeData.timer.stop();
	probeData.argsArray = truncateArgsArray(methodArgs);
	am.emit('redis', {time: probeData.timer.startTimeMillis, cmd: cmd, args: probeData.argsArray, duration: probeData.timer.timeDelta});
};

/*
 * Heavyweight request probes for redis requests
 * 
 */
RedisProbe.prototype.requestStart = function (probeData, cmd, methodArgs) {
	probeData.req = request.startRequest( 'redis', cmd, false, probeData.timer);
};

RedisProbe.prototype.requestEnd = function (probeData, method, methodArgs) {
	var context = {};
	// Don't re-truncate if we've already done the work.
	if( probeData.argsArray ) {
		context.args = probeData.argsArray;
	} else {
		context.cmd = cmd;
		context.args = truncateArgsArray(methodArgs);
	}
	probeData.req.stop(context);
};

module.exports = RedisProbe;