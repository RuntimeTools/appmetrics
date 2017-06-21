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

if (process.platform !== 'linux') {
  console.log('1..0 # SKIP watchdog is Linux-only for now');
  return;
}

if (process.versions.v8 >= '3.15' && process.versions.v8 < '3.29') {
  console.log('1..0 # SKIP watchdog is incompatible with this node version');
  return;
}

var app = require('./test_app');
var monitor = app.appmetrics.monitor();

var tap = require('tap');
tap.plan(2); // NOTE: This needs to be updated when tests are added/removed
tap.tearDown(function() {
  app.endRun();
});

var completedTests = {}; // Stores which tests have been run, ensures single run per test

tap.test('Profiling Data using Watchdog', function(t) {
  app.appmetrics.setConfig('advancedProfiling', { threshold: 1 });
  app.appmetrics.enable('profiling');
  monitor.on('profiling', function(data) {
    if (completedTests.watchdog != true) {
      t.type(app.appmetrics.watchdogActivationCount, 'function');
      var activationCount = app.appmetrics.watchdogActivationCount();
      t.ok(isInteger(activationCount) && activationCount > 0);
      runProfilingTests(data, t);
      t.end();
      completedTests.watchdog = true;
    }
  });
});

tap.test('Setting Watchdog threshold to high value, no profiling data expected', function(t) {
  app.appmetrics.disable('profiling');
  delay(100);
  app.appmetrics.setConfig('advancedProfiling', { threshold: 1000 });
  app.appmetrics.enable('profiling');
  monitor.on('profiling', function(data) {
    t.fail('Profiling data was produced in error');
  });
  delay(200);
  delay(200);
  delay(200);
  delay(200);
  delay(200);
  setTimeout(function() {
    t.end();
  }, 5000);
});

function delay(ms) {
  var start = Date.now();
  while (Date.now() < start + ms);
}

function isReasonableTimestamp(time) {
  return new Date(time).getFullYear() === new Date().getFullYear();
}

function isInteger(n) {
  return isNumeric(n) && n % 1 == 0;
}

function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

function runProfilingTests(profData, t) {
  var functions = profData['functions'];

  t.ok(isInteger(profData.time), 'Timestamp is an integer');
  t.ok(
    isReasonableTimestamp(parseInt(profData.time, 10)),
    'Timestamp is a reasonable value (expected to contain current year)'
  );

  testValuesAreIntegers('self');
  testValuesAreIntegers('parent');
  testValuesAreIntegers('line');
  testValuesAreIntegers('count');

  // Parse values of all functions for next tests
  for (var currentFunction in functions) {
    for (var entry in currentFunction) {
      if (entry != 'file' || entry != 'name') currentFunction[entry] = parseInt(currentFunction[entry], 10);
    }
  }

  testValuesAreGreaterThan('self', 0); // Self can't be 0 as the root can't be a function
  testValuesAreGreaterThan('parent', -1);
  testValuesAreGreaterThan('line', -1);
  testValuesAreGreaterThan('count', -1);

  // Check the same key for all functions in data are integer
  function testValuesAreIntegers(keyName) {
    for (var index in functions) {
      if (!isInteger(functions[index][keyName])) {
        t.fail('Value of ' + keyName + ' should be an integer (' + functions[index][keyName] + ')');
        return;
      }
    }
    t.pass("Value of '" + keyName + "' is an integer for all functions");
  }

  function testValuesAreGreaterThan(keyName, val) {
    for (var index in functions) {
      if (!(functions[index][keyName] > val)) {
        t.fail("Value of '" + keyName + "' should be greater than " + val + ' (' + functions[index][keyName] + ')');
        return;
      }
    }
    t.pass("Value of '" + keyName + "' is greater than " + val + ' for all functions');
  }
}
