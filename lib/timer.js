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

function Timer() {
  this.startTime = process.hrtime();
  this.startTimeMillis = Date.now();
  this.timeDelta = -1;
  this.cpuTimeDelta = -1;
}

Timer.prototype.stop = function() {
  // Prevent the timer being stopped twice.
  if (this.timeDelta == -1) {
    var dur = process.hrtime(this.startTime);
    this.timeDelta = dur[0] * 1000 + dur[1] / 1000000;
  }
};

exports.start = function() {
  return new Timer();
};
