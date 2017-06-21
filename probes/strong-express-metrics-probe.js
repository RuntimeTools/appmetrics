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
var util = require('util');
var am = require('../');

function StrongExpressMetricsProbe() {
  Probe.call(this, 'strong-express-metrics');
}

util.inherits(StrongExpressMetricsProbe, Probe);

// This method attaches our probe to the instance of the strong-express-metrics module (target)
StrongExpressMetricsProbe.prototype.attach = function(name, target) {
  if (name != 'strong-express-metrics') return target;
  if (target.__ddProbeAttached__) return target;
  target.__ddProbeAttached__ = true;

  // Call the onRecord function and emit an appmetrics event
  target.onRecord(function(record) {
    am.emit('express:usage-record', record);
  });
  return target;
};

module.exports = StrongExpressMetricsProbe;
