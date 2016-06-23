/*******************************************************************************
 * Copyright 2016 IBM Corp.
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
var cluster = require('cluster');
var extend = require('util')._extend;

function ExpressProbe() {
	Probe.call(this, 'express');
	this.config = {
			filters: []
	};
}

util.inherits(ExpressProbe, Probe);

var VERSION = require('../package.json').version;

module.exports = createStatsHandler;

function createStatsHandler(recordBuilder) {
  return function statistics(req, res, next) {
    req.__start = new Date();

    // Save the client address, as it is not available in Node v0.10
    // at the time when the response was sent
    req.__clientAddress = req.ip || req.connection.remoteAddress;

    res.on('finish', function() {
      res.durationInMs = new Date() - req.__start;

     try {
        var record = createRecord(recordBuilder, req, res);
        am.emit('express', record);
      } catch (err) {
        console.warn('strong-express-metrics ignored error', err.stack);
      }
    });
    next();
  };
}

function createRecord(builder, req, res) {
  var record = {
    version: VERSION,
    timestamp: Date.now(),
    client: {
      address: req.__clientAddress,
      // How to extract client-id and username?
      // Should we parse Authorization header for Basic Auth?
      id: undefined,
      username: undefined
    },
    request: {
      method: req.method,
      url: req.url
    },
    response: {
      status: res.statusCode,
      duration: res.durationInMs,
      // Computing the length of a writable stream
      // is tricky and expensive.
      bytes: undefined
    },
    process: {
      pid: process.pid,
      workerId: cluster.worker && cluster.workerId
    },
    data: {
      // placeholder for user-provided data
    }
  };

  addLoopBackInfo(record, req, res);

  var custom = builder && builder(req, res);

  if (custom) {
    for (var k in custom)
      record[k] = extend(record[k], custom[k]);
  }

  return record;
}

function addLoopBackInfo(record, req, res) {
  var ctx = req.remotingContext;
  if (!ctx) return;

  var method = ctx.method;
  var lb = record.loopback = {
    modelName: method.sharedClass ? method.sharedClass.name : null,
    remoteMethod: method.name
  };

  if (!method.isStatic) {
    lb.remoteMethod = 'prototype.' + lb.remoteMethod;
    lb.instanceId = ctx.ctorArgs && ctx.ctorArgs.id;
  } else if (/ById$/.test(method.name)) {
    // PersistedModel.findById, PersistedModel.deleteById
    lb.instanceId = ctx.args.id;
  }
}
