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

function clockTime() {
	var time = process.hrtime();
	return time[0] * 1000 + (time[1] / 1000000.0);
}

/*
 * CPU time of requests/events not currently implemented
 */
function clockCpuTime() {
	return 0;
}

function Timer() {
	this.startTime = process.hrtime();
	this.startTimeMillis = Date.now();
	this.startCpuTime = clockCpuTime();
}

Timer.prototype.stop = function() {
	var dur = process.hrtime(this.startTime);
	this.stopTimeMillis = Date.now();
	this.timeDelta = this.stopTimeMillis - this.startTimeMillis;
	this.duration = (dur[0] * 1000) + (dur[1] / 1000000);
	this.cpuTimeDelta = -1;
}

Timer.prototype.cpuTimeDeltaInMs = function() {
	return 0;
}

exports.start = function(){ return new Timer(); };
