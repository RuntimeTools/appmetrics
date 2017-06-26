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

var am = require('../');
var aspect = require('../lib/aspect.js');
var Probe = require('../lib/probe.js');
var request = require('../lib/request.js');

var util = require('util');

function HttpsProbe() {
  Probe.call(this, 'https');
  this.config = {
    filters: [],
  };
}
util.inherits(HttpsProbe, Probe);

HttpsProbe.prototype.attach = function(name, target) {
  var that = this;
  if (name === 'https') {
    if (target.__probeAttached__) return target;
    target.__probeAttached__ = true;
    var methods = ['on', 'addListener'];

    aspect.before(target.Server.prototype, methods, function(obj, methodName, args, probeData) {
      if (args[0] !== 'request') return;
      if (obj.__httpsProbe__) return;
      obj.__httpsProbe__ = true;
      aspect.aroundCallback(args, probeData, function(obj, args, probeData) {
        var httpsReq = args[0];
        var res = args[1];
        // Filter out urls where filter.to is ''
        var traceUrl = that.filterUrl(httpsReq);
        if (traceUrl !== '') {
          that.metricsProbeStart(probeData, httpsReq.method, traceUrl);
          that.requestProbeStart(probeData, httpsReq.method, traceUrl);
          aspect.after(res, 'end', probeData, function(obj, methodName, args, probeData, ret) {
            that.metricsProbeEnd(probeData, httpsReq.method, traceUrl, res, httpsReq);
            that.requestProbeEnd(probeData, httpsReq.method, traceUrl, res, httpsReq);
          });
        }
      });
    });
  }
  return target;
};

/*
 * Custom req.url parser that strips out any trailing query
 */
function parse(url) {
  ['?', '#'].forEach(function(separator) {
    var index = url.indexOf(separator);
    if (index !== -1) url = url.substring(0, index);
  });
  return url;
};

/*
 * Ignore requests for URLs which we've been configured via regex to ignore
 */
HttpsProbe.prototype.filterUrl = function(req) {
  var resultUrl = parse(req.url);
  var filters = this.config.filters;
  if (filters.length === 0) return resultUrl;

  var identifier = req.method + ' ' + resultUrl;
  for (var i = 0; i < filters.length; ++i) {
    var filter = filters[i];
    if (filter.regex.test(identifier)) {
      return filter.to;
    }
  }
  return resultUrl;
};

/*
 * Lightweight metrics probe for HTTPS requests
 *
 * These provide:
 * 		time:		time event started
 * 		method:		HTTPS method, eg. GET, POST, etc
 * 		url:		The url requested
 * 		duration:	the time for the request to respond
 */

HttpsProbe.prototype.metricsEnd = function(probeData, method, url, res, httpsReq) {
  if (probeData && probeData.timer) {
    probeData.timer.stop();
    am.emit('https', {
      time: probeData.timer.startTimeMillis,
      method: method,
      url: url,
      duration: probeData.timer.timeDelta,
      header: res._header,
      statusCode: res.statusCode,
      contentType: res.getHeader('content-type'),
      requestHeader: httpsReq.headers,
    });
  }
};

/*
 * Heavyweight request probes for HTTPS requests
 */

HttpsProbe.prototype.requestStart = function(probeData, method, url) {
  var reqType = 'https';
  // Mark as a root request as this happens due to an external event
  probeData.req = request.startRequest(reqType, url, true, probeData.timer);
};

HttpsProbe.prototype.requestEnd = function(probeData, method, url, res, httpsReq) {
  if (probeData && probeData.req) {
    probeData.req.stop({
      url: url,
      method: method,
      requestHeader: httpsReq.headers,
      statusCode: res.statusCode,
      header: res._header,
      contentType: res.getHeader('content-type'),
    });
  }
};

/*
 * Set configuration by merging passed in config with current one
 */
HttpsProbe.prototype.setConfig = function(newConfig) {
  if (typeof newConfig.filters !== 'undefined') {
    newConfig.filters.forEach(function(filter) {
      if (typeof filter.regex === 'undefined') {
        filter.regex = new RegExp(filter.pattern);
      }
    });
  }
  for (var prop in newConfig) {
    if (typeof newConfig[prop] !== 'undefined') {
      this.config[prop] = newConfig[prop];
    }
  }
};

module.exports = HttpsProbe;
