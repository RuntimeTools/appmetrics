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
'use strict';
var Probe = require('../lib/probe.js');
var aspect = require('../lib/aspect.js');
var request = require('../lib/request.js');
var util = require('util');
var am = require('../');

function MongoProbe() {
  Probe.call(this, 'mongodb');
}
util.inherits(MongoProbe, Probe);

MongoProbe.prototype.aspectCollectionMethod = function(coll, method) {
  var that = this;
  aspect.around(
    coll,
    method,
    function(target, methodName, methodArgs, probeData) {
      var collectionName = target.collectionName;

      that.metricsProbeStart(probeData, target, method, methodArgs);
      that.requestProbeStart(probeData, target, method, methodArgs);
      if (aspect.findCallbackArg(methodArgs) != undefined) {
        aspect.aroundCallback(methodArgs, probeData, function(target, args, probeData) {
          // Call the transaction link with a name and the callback for strong trace
          var callbackPosition = aspect.findCallbackArg(methodArgs);
          if (typeof callbackPosition != 'undefined') {
            aspect.strongTraceTransactionLink('mongodb: ', methodName, methodArgs[callbackPosition]);
          }
          var count;

          if (args && args.length > 1) {
            var res = args[1];
            if (res) {
              if (res.hasOwnProperty('matchedCount')) {
                count = res.matchedCount;
              } else if (res.hasOwnProperty('modifiedCount')) {
                count = res.modifiedCount;
              } else if (res.hasOwnProperty('insertedCount')) {
                count = res.insertedCount;
              } else if (res.hasOwnProperty('upsertedCount')) {
                count = res.upsertedCount;
              } else if (res.hasOwnProperty('deletedCount')) {
                count = res.deletedCount;
              } else if (res.hasOwnProperty('length')) {
                count = res.length;
              } else if (typeof res === 'number') {
                count = res;
              }
              if (methodName === 'bulkWrite') {
                count = res.modifiedCount + res.insertedCount + res.deletedCount + res.upsertedCount;
              }
            }
          }

          that.metricsProbeEnd(probeData, collectionName, method, methodArgs, count);
          that.requestProbeEnd(probeData, method, methodArgs);
        });
      }
    },
    function(target, methodName, methodArgs, probeData, rc) {
      var collectionName = target.collectionName;

      if (aspect.findCallbackArg(methodArgs) == undefined) {
        that.metricsProbeEnd(probeData, collectionName, method, methodArgs);
        that.requestProbeEnd(probeData, method, methodArgs);
      }
      return rc;
    }
  );
};

MongoProbe.prototype.attach = function(name, target) {
  var that = this;
  if (name != 'mongodb') return target;
  if (target.__ddProbeAttached__) return target;
  target.__ddProbeAttached__ = true;

  var coll = target['Collection'].prototype;
  var method = 'find';
  aspect.around(
    coll,
    method,
    function(target, methodName, methodArgs, probeData) {
      that.metricsProbeStart(probeData, target, method, methodArgs);
      that.requestProbeStart(probeData, target, method, methodArgs);
    },
    function(target, methodName, findArgs, probeData, rc) {
      var collectionName = target.collectionName;

      if (rc == undefined) {
        that.metricsProbeEnd(probeData, collectionName, method, findArgs);
        that.requestProbeEnd(probeData, method, findArgs);
      } else {
        aspect.before(rc, 'toArray', function(target, methodName, args, context) {
          aspect.aroundCallback(args, probeData, function(target, args, probeData) {
            var count;

            if (args && args.length > 1) {
              var res = args[1];
              if (res && res.hasOwnProperty('length')) {
                count = res.length;
              }
            }
            that.metricsProbeEnd(probeData, collectionName, method, findArgs, count);
            that.requestProbeEnd(probeData, method, findArgs);
          });
        });
      }
      return rc;
    }
  );

  that.aspectCollectionMethod(coll, 'aggregate');
  that.aspectCollectionMethod(coll, 'bulkWrite');
  that.aspectCollectionMethod(coll, 'count');
  that.aspectCollectionMethod(coll, 'createIndex');
  that.aspectCollectionMethod(coll, 'createIndexes');
  that.aspectCollectionMethod(coll, 'deleteMany');
  that.aspectCollectionMethod(coll, 'deleteOne');
  that.aspectCollectionMethod(coll, 'distinct');
  that.aspectCollectionMethod(coll, 'drop');
  that.aspectCollectionMethod(coll, 'dropIndex');
  that.aspectCollectionMethod(coll, 'dropIndexes');
  that.aspectCollectionMethod(coll, 'findOne');
  that.aspectCollectionMethod(coll, 'findOneAndDelete');
  that.aspectCollectionMethod(coll, 'findOneAndReplace');
  that.aspectCollectionMethod(coll, 'findOneAndUpdate');
  that.aspectCollectionMethod(coll, 'geoHaystackSearch');
  that.aspectCollectionMethod(coll, 'geoNear');
  that.aspectCollectionMethod(coll, 'group');
  that.aspectCollectionMethod(coll, 'indexes');
  that.aspectCollectionMethod(coll, 'indexExists');
  that.aspectCollectionMethod(coll, 'indexInformation');
  that.aspectCollectionMethod(coll, 'insertMany');
  that.aspectCollectionMethod(coll, 'insertOne');
  that.aspectCollectionMethod(coll, 'mapReduce');
  that.aspectCollectionMethod(coll, 'reIndex');
  that.aspectCollectionMethod(coll, 'rename');
  that.aspectCollectionMethod(coll, 'replaceOne');
  that.aspectCollectionMethod(coll, 'updateMany');
  that.aspectCollectionMethod(coll, 'updateOne');

  return target;
};

/*
 * Lightweight metrics probe for MongoDB queries
 *
 * These provide:
 *         time:        time event started
 *         query:        the query itself
 *         duration:    the time for the request to respond
 *         method:      the executed method for the query, such as find, update
 *         collection:  the mongo collection
 */
MongoProbe.prototype.metricsEnd = function(probeData, collectionName, method, methodArgs, count) {
  if (probeData && probeData.timer) {
    probeData.timer.stop();
    am.emit('mongo', {
      time: probeData.timer.startTimeMillis,
      query: JSON.stringify(methodArgs[0]),
      duration: probeData.timer.timeDelta,
      method: method,
      collection: collectionName,
      count: count,
    });
  }
};

/*
 * Heavyweight request probes for MongoDB queries
 */
MongoProbe.prototype.requestStart = function(probeData, target, method, methodArgs) {
  probeData.req = request.startRequest('mongo', method + '(' + target.collectionName + ')', false, probeData.timer);
};

MongoProbe.prototype.requestEnd = function(probeData, method, methodArgs) {
  if (probeData && probeData.req) probeData.req.stop({ query: JSON.stringify(methodArgs[0]) });
};

module.exports = MongoProbe;
