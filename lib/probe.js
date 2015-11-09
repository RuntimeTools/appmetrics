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

var aspect = require('./aspect.js');
var request = require('./request.js');

function Probe(name) {
	this.name = name;
	this.config = {};
	this.metricsProbeStart = this.metricsStart;
	this.metricsProbeEnd = this.metricsEnd;
}

/*
 * Function to add instrumentation to the target module
 */
Probe.prototype.attach = function(name, target, hc) {
	return target;
};

/*
 * Set configuration by merging passed in config with current one
 */
Probe.prototype.setConfig = function (newConfig) {
	for (var prop in newConfig) {
		if (typeof(newConfig[prop]) !== 'undefined') {
			config[prop] = newConfig[prop];
		}
	}
	config.filters.forEach(function(filter) {
		if (typeof(filter.regex) === 'undefined') {
			filter.regex = new RegExp(filter.pattern);
		}
	});
};

/*
 * Lightweight metrics probes
 */
Probe.prototype.metricsStart = function(req, res, am) {
	start = Date.now();
	timer = process.hrtime();
};

Probe.prototype.metricsEnd = function(req, res, am) {
};

/*
 * Heavyweight request probes
 */
var request = require('../lib/request.js');

Probe.prototype.requestStart = function (req, res, am) {};

Probe.prototype.requestEnd = function (req, res, am) {};

/*
 * Default to metrics on
 */
Probe.prototype.metricsProbeStart =  function(req, res, am) {};
Probe.prototype.metricsProbeEnd =  function(req, res, am) {};

/*
 * Default to requests off
 */
Probe.prototype.requestProbeStart = function (req, res, am) {
};
Probe.prototype.requestProbeEnd = function (req, res, am) {};

Probe.prototype.enableRequests = function() {
	this.requestProbeStart = this.requestStart;
	this.requestProbeEnd = this.requestEnd;
}

Probe.prototype.disableRequests = function() {
	this.requestProbeStart = function () {};
	this.requestProbeEnd = function () {};
}

Probe.prototype.enable = function() {
	this.metricsProbeStart = this.metricsStart;
	this.metricsProbeEnd = this.metricsEnd;
};

Probe.prototype.disable = function() {
	this.metricsProbeStart = function() {};
	this.metricsProbeEnd = function() {};
};

Probe.prototype.getDuration = function() {
    var end = process.hrtime(timer);
    return (end[0] * 1000) + (end[1] / 1000000);
}

module.exports = Probe;