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
var global = false;

process.argv.forEach(function(elem) {
  if (elem == '-g'){
    global = true;
  }
});

var agent;

//If running global test, run long enough to ensure the agent has loaded and process doesn't crash
if (global) {
	var duration_secs = process.argv[2] || 10; //Default 10 seconds for global tests
	setTimeout(function(){
		clearInterval(ih);
	}, duration_secs*1000);
}

//If being run from other test, start the agent and make available
else {
	agent = require('../');
	agent.start();

	// Make agent visible for other script files.
	module.exports.agent = agent;
}

//Write a string to memory on timer
var test = null;
var ih = setInterval(function() {
  var dummy = new Buffer(1024*1024);
  dummy.write("hello");
  test = dummy.toString()[0];
}, 100);


module.exports.endRun = function(){
	agent.stop();
	clearInterval(ih);
}
