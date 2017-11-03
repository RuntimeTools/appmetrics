/*******************************************************************************
 * Copyright 2017 IBM Corp.
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
var util = require('util');
var am = require('../');

function CouchbaseProbe() {
  Probe.call(this, 'couchbase');
}
util.inherits(CouchbaseProbe, Probe);

CouchbaseProbe.prototype.aspectBucketMethod = function(bucket, method) {
  var that = this;

  aspect.before(bucket, method, function(target, methodName, methodArgs, probeData) {
    that.metricsProbeStart(probeData, method, methodArgs);
    if (aspect.findCallbackArg(methodArgs) != undefined) {
      aspect.aroundCallback(methodArgs, probeData, function(target, args) {
        that.metricsProbeEnd(probeData, method, methodArgs, args[0]);
      });
    }
  });
};

// Most used couchbase bucket methods
const bucketMethods = ['upsert', 'insert', 'replace', 'remove', 'get', 'getMulti'];

CouchbaseProbe.prototype.attach = function(name, target) {
  var that = this;
  if (name != 'couchbase') return target;
  if (target.__ddProbeAttached__) return target;
  target.__ddProbeAttached__ = true;

  var mock = target['Mock']['Cluster'].prototype;
  var cluster = target['Cluster'].prototype;

  var data = {};
  aspect.after(mock, 'openBucket', data, function(target, methodName, args, probeData, bucket) {
    for(key in bucketMethods) {
      that.aspectBucketMethod(bucket, bucketMethods[key]);
    }
    return bucket;
  });

  aspect.after(cluster, 'openBucket', data, function(target, methodName, args, probeData, bucket) {
    for(key in bucketMethods) {
      that.aspectBucketMethod(bucket, bucketMethods[key]);
    }
    return bucket;
  });

  return target;
};

/*
 * Lightweight metrics probe for couchbase queries
 *
 * These provide:
 *    time:     time event started
 *    bucket:   The bucket executed on
 *    method:   the method called on the bucket
 *    duration: the time for the request to respond
 */
CouchbaseProbe.prototype.metricsEnd = function(probeData, method, methodArgs, err) {
  if (probeData && probeData.timer) {
    probeData.timer.stop();
    var eventTimer = probeData.timer;
    am.emit('couchbase', {
      time: eventTimer.startTimeMillis,
      bucket: methodArgs[0],
      method: method,
      duration: eventTimer.timeDelta,
      error: err
    });
  }
};


module.exports = CouchbaseProbe;
