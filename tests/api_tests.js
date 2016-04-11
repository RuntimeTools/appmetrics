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
 
var testApp = require('./test_runner');
var monitor = testApp.agent.monitor();

var assert = require('assert');
var runTests = require('./general_tests');

console.error('Running API tests:');

monitor.on('cpu', function(data) {
  runTests.runCPUTests(data);
});

monitor.on('memory', function(data) {
  runTests.runMemoryTests(data);

  assert(runTests.isInteger(data.physical_used),
         'Memory data message does not have an integer used physical memory ('
          + data.physical_used + ')');

  data.physical_used = parseInt(data.physical_used);
  assert(data.physical_used === -1 || data.physical_used >= 0,
         'Memory data message does not contain a valid used physical memory ('
          + data.physical_used + ')');
});

monitor.on('gc', function(data) {
  runTests.runGCTests(data);
});

monitor.on('profiling', function(data) {
  runTests.runProfilingTests(data.time);

  for (var index in data['functions'])
  {
    runTests.runProfilingTests(data['functions'][index]);
  }
});

monitor.on('initialized', function () {
  var nodeEnv = monitor.getEnvironment();
  runTests.runNodeEnvTests(nodeEnv);
  runTests.runCommonEnvTests(nodeEnv);
});

monitor.on('eventloop', function(data) {
  console.error('Event loop tests running ...');

  assert(runTests.isInteger(data.time),
         "Event loop message does not have an integer timestamp (" + data.time + ")");

  assert(runTests.isReasonableTimestamp(parseInt(data.time)),
         "Event loop message contains a bad timestamp (" + data.time + ")");

  for (var elem in data.latency)
    assert(runTests.isNumeric(data.latency[elem]),
           "Event loop message does not have a numeric " + elem
            + " latency value (" + data.latency[elem] + ")");

    assert(data.latency[elem] > 0,
           "Event loop message contaims " + elem
            + " latency less than or equal to 0 (" + data.latency[elem] + ")");

    assert(data.latency[elem] <= 5000,
           "Event loop message contains " + elem
            + " latency greater than 5s (" + data.latency[elem] + ")");

    console.error('Event loop tests passed succesfully.');
});
