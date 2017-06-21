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

var timer = require('./timer.js');
var util = require('util');
var domain = require('domain');
var am = require('../');

/*
 * Global Request Tracking
 *
 * ID's are assigned to each event. Its important that the count of events is linear for
 * requests as the ID can be used for sampling. It doesn't matter what the event ID is as long
 * as its unique inside a request. We therefore assign:
 * 1) An ID that is the request count
 * or
 * 2) An ID that is the event count
 */
var nextRequestId = 1;
var nextEventId = 1;

function Request(type, name, root) {
  this.children = [];
  this.name = name;
  this.type = type;

  if (root === true) {
    var reqDomain = domain.create();
    reqDomain.enter();
  }

  if (process.domain) {
    this.parent = process.domain.currentRequest;
  }
  this.id = nextEventId;
  ++nextEventId;
  if (this.parent) {
    this.top = this.parent.top;
    this.parent.children.push(this);
  } else {
    this.top = this;
    if (this.type) {
      /* If we're the top and we're a type, we get a request Id, not an event Id */
      this.id = nextRequestId;
      ++nextRequestId;
    }
  }
}

Request.prototype.traceStart = function() {
  if (!this.tracedStart) {
    this.tracedStart = true;
    // we may delay tracing parent requests until later time when they exceed threshold
    if (this.parent) {
      this.parent.traceStart();
    }
  }
};

Request.prototype.traceStop = function() {
  if (!this.traceStopped) {
    this.traceStopped = true;
    if (config.minClockStack != -1 && this.timer.timeDelta >= config.minClockStack) {
      this.stack = this.fetchStack();
    }
  }
};

Request.prototype.start = function() {
  this.active = true;
  if (!this.timer) {
    this.timer = timer.start();
  }
  if (process.domain) {
    process.domain.currentRequest = this;
  }
};

Request.prototype.setContext = function(context) {
  this.context = context;
};

Request.prototype.stop = function(context) {
  if (this.active) {
    if (context) this.context = context;
    this.active = false;
    this.timer.stop();
    this.children.forEach(function(c) {
      c.stop();
    });

    if (config.minClockTrace != -1 && this.timer.timeDelta >= config.minClockTrace) {
      this.traceStart(); // delayed start tracing (will call parent tracing if needed)
      this.traceStop();
    }
    if (process.domain) {
      process.domain.currentRequest = this.parent;
      if (typeof process.domain.currentRequest === 'undefined') {
        // End of a root request, so raise a request event
        process.domain.exit();
        am.emit('request', {
          time: this.timer.startTimeMillis,
          type: this.type,
          name: this.name,
          duration: this.timer.timeDelta,
          request: this,
        });
      }
    }
  }
};

Request.prototype.fetchStack = function(cfg) {
  //	Originally only if methodTrace enabled
  var oldLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = 15;
  var trace = {};
  Error.captureStackTrace(trace);
  Error.stackTraceLimit = oldLimit;
  var lines = trace.stack.split('\n');
  return lines.filter(isNotDeepDiveStack).map(convertLine).join('\n');
};

function isNotDeepDiveStack(line) {
  return line.indexOf('appmetrics') == -1 && line.indexOf('lib/aspect.js') == -1;
}

var fullStackRegex = /at (.*)\.(.*) \(((.*)(:\d*)(:\d*))\)/;
var onlyFuncStackRegex = /at (.*) \(((.*)(:\d*)(:\d*))\)/;
var onlyFileStackRegex = /at ((.*)(:\d*)(:\d*))/;
var stackFormat = 'at %s.%s(%s%s)';
function convertLine(line) {
  var m = fullStackRegex.exec(line);
  if (m) {
    return util.format(stackFormat, m[1], m[2], m[4], m[5]);
  }
  m = onlyFuncStackRegex.exec(line);
  if (m) {
    return util.format(stackFormat, '<module>', m[1], m[3], m[4]);
  }
  m = onlyFileStackRegex.exec(line);
  if (m) {
    return util.format(stackFormat, '<module>', '<root>', m[2], m[3]);
  }
  return line;
}

exports.startRequest = function(type, name, root, eventTimer) {
  var req = new Request(type, name, root);
  if (eventTimer) {
    req.timer = eventTimer;
  }
  req.start();
  return req;
};

exports.startMethod = function(name, eventTimer) {
  var req = new Request(null, name);
  if (eventTimer) {
    req.timer = eventTimer;
  }
  req.start();
  return req;
};

var config = {
  minClockTrace: 0,
  minCpuTrace: 0,
  minCpuStack: 0,
  minClockStack: -1,
};

exports.setConfig = function(newConfig) {
  /*
	 * merge passed in config with current one
	 */
  for (var prop in newConfig) {
    if (typeof newConfig[prop] !== 'undefined') {
      config[prop] = newConfig[prop];
    }
  }
};
