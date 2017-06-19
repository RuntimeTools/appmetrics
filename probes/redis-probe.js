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
'use strict';
var Probe = require('../lib/probe.js');
var aspect = require('../lib/aspect.js');
var request = require('../lib/request.js');
var am = require('../');
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
  if (name != 'redis') return;
  if (target.__probeAttached__) return target;
  target.__probeAttached__ = true;
  var methods = [];
  [
    'APPEND',
    'AUTH',
    'BGREWRITEAOF',
    'BGSAVE',
    'BITCOUNT',
    'BITOP',
    'BITPOS',
    'BLPOP',
    'BRPOP',
    'BRPOPLPUSH',
    'CLIENT',
    'CLUSTER',
    'COMMAND',
    'CONFIG',
    'DBSIZE',
    'DEBUG',
    'DECR',
    'DECRBY',
    'DEL',
    'DISCARD',
    'DUMP',
    'ECHO',
    'EVAL',
    'EVALSHA',
    'EXISTS',
    'EXPIRE',
    'EXPIREAT',
    'FLUSHALL',
    'FLUSHDB',
    'GEOADD',
    'GEOHASH',
    'GEOPOS',
    'GEODIST',
    'GEORADIUS',
    'GEORADIUSBYMEMBER',
    'GET',
    'GETBIT',
    'GETRANGE',
    'GETSET',
    'HDEL',
    'HEXISTS',
    'HGET',
    'HGETALL',
    'HINCRBY',
    'HINCRBYFLOAT',
    'HKEYS',
    'HLEN',
    'HMGET',
    'HMSET',
    'HSET',
    'HSETNX',
    'HSTRLEN',
    'HVALS',
    'INCR',
    'INCRBY',
    'INCRBYFLOAT',
    'INFO',
    'KEYS',
    'LASTSAVE',
    'LINDEX',
    'LINSERT',
    'LLEN',
    'LPOP',
    'LPUSH',
    'LPUSHX',
    'LRANGE',
    'LREM',
    'LSET',
    'LTRIM',
    'MGET',
    'MIGRATE',
    'MONITOR',
    'MOVE',
    'MSET',
    'MSETNX',
    'OBJECT',
    'PERSIST',
    'PEXPIRE',
    'PEXPIREAT',
    'PFADD',
    'PFCOUNT',
    'PFMERGE',
    'PING',
    'PSETEX',
    'PSUBSCRIBE',
    'PUBSUB',
    'PTTL',
    'PUBLISH',
    'PUNSUBSCRIBE',
    'QUIT',
    'RANDOMKEY',
    'RENAME',
    'RENAMENX',
    'RESTORE',
    'ROLE',
    'RPOP',
    'RPOPLPUSH',
    'RPUSH',
    'RPUSHX',
    'SADD',
    'SAVE',
    'SCARD',
    'SCRIPT',
    'SDIFF',
    'SDIFFSTORE',
    'SELECT',
    'SET',
    'SETBIT',
    'SETEX',
    'SETNX',
    'SETRANGE',
    'SHUTDOWN',
    'SINTER',
    'SINTERSTORE',
    'SISMEMBER',
    'SLAVEOF',
    'SLOWLOG',
    'SMEMBERS',
    'SMOVE',
    'SORT',
    'SPOP',
    'SRANDMEMBER',
    'SREM',
    'STRLEN',
    'SUBSCRIBE',
    'SUNION',
    'SUNIONSTORE',
    'SYNC',
    'TIME',
    'TTL',
    'TYPE',
    'UNSUBSCRIBE',
    'UNWATCH',
    'WAIT',
    'WATCH',
    'ZADD',
    'ZCARD',
    'ZCOUNT',
    'ZINCRBY',
    'ZINTERSTORE',
    'ZLEXCOUNT',
    'ZRANGE',
    'ZRANGEBYLEX',
    'ZREVRANGEBYLEX',
    'ZRANGEBYSCORE',
    'ZRANK',
    'ZREM',
    'ZREMRANGEBYLEX',
    'ZREMRANGEBYRANK',
    'ZREMRANGEBYSCORE',
    'ZREVRANGE',
    'ZREVRANGEBYSCORE',
    'ZREVRANK',
    'ZSCORE',
    'ZUNIONSTORE',
    'SCAN',
    'SSCAN',
    'HSCAN',
    'ZSCAN',
  ].map(function(m) {
    methods.push(m);
    methods.push(m.toLowerCase());
  });

  /* Instrument the basic set of asynchronous calls. */
  aspect.around(
    target.RedisClient.prototype,
    methods,
    function(target, method, methodArgs, probeData) {
      var eventName = method.toLowerCase();
      that.metricsProbeStart(probeData, eventName, methodArgs);
      that.requestProbeStart(probeData, eventName, methodArgs);
      /* REDIS commands don't have to have a callback.
		 * All redis calls are asynchronous so we need to instrument or add a
		 * callback to stop the timer.
		 */
      aspect.aroundCallback(methodArgs, probeData, function(target, args) {
        // Call the transaction link with a name and the callback for strong trace
        var callbackPosition = aspect.findCallbackArg(methodArgs);
        aspect.strongTraceTransactionLink('redis: ', eventName, methodArgs[callbackPosition]);

        that.metricsProbeEnd(probeData, eventName, methodArgs);
        that.requestProbeEnd(probeData, eventName, methodArgs);
      });
    },
    function(target, method, methodArgs, probeData, rc) {
      if (aspect.findCallbackArg(methodArgs) == undefined) {
        var eventName = method.toLowerCase();
        that.metricsProbeEnd(probeData, eventName, methodArgs);
        that.requestProbeEnd(probeData, eventName, methodArgs);
      }
    }
  );

  /* Monitor all calls made as one batch/multi.exec call as a single event.
	 * Instrument the exec method on the object returned from client.batch()
	 * or client.multi()
	 */
  aspect.after(target.RedisClient.prototype, ['multi', 'batch', 'MULTI', 'BATCH'], {}, function(
    target,
    mode,
    args,
    probeData,
    client
  ) {
    // Log the event name as batch.exec or multi.exec
    var eventName = mode.toLowerCase() + '.exec';
    aspect.around(
      client,
      ['exec', 'EXEC'],
      function(target, method, methodArgs, probeData) {
        that.metricsProbeStart(probeData, eventName, methodArgs);
        that.requestProbeStart(probeData, eventName, methodArgs);
        /* REDIS commands don't have to have a callback.
			 * All redis calls are asynchronous so we need to instrument or add a
			 * callback to stop the timer.
			 */
        aspect.aroundCallback(methodArgs, probeData, function() {
          that.metricsProbeEnd(probeData, eventName, methodArgs);
          that.requestProbeEnd(probeData, eventName, methodArgs);
        });
      },
      function(target, method, methodArgs, probeData, rc) {
        if (aspect.findCallbackArg(methodArgs) == undefined) {
          that.metricsProbeEnd(probeData, eventName, methodArgs);
          that.requestProbeEnd(probeData, eventName, methodArgs);
        }
      }
    );
    return client;
  });
  return target;
};

/*
 * Lightweight metrics probe for REDIS requests
 *
 * These provide:
 * 		time:		time event started
 * 		cmd:		REDIS method, eg. GET, SET, INCR, etc
 * 		duration:	the time for the request to respond
 */

RedisProbe.prototype.metricsEnd = function(probeData, cmd, methodArgs) {
  if (probeData && probeData.timer) {
    probeData.timer.stop();
    am.emit('redis', {
      time: probeData.timer.startTimeMillis,
      cmd: cmd,
      duration: probeData.timer.timeDelta,
    });
  }
};

/*
 * Heavyweight request probes for redis requests
 *
 */
RedisProbe.prototype.requestStart = function(probeData, cmd, methodArgs) {
  probeData.req = request.startRequest('redis', cmd, false, probeData.timer);
};

RedisProbe.prototype.requestEnd = function(probeData, cmd, methodArgs) {
  if (probeData && probeData.req) {
    var context = {};
    context.cmd = cmd;
    probeData.req.stop(context);
  }
};

module.exports = RedisProbe;
