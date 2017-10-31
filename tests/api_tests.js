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
var app = require('./test_app');
var appmetrics = app.start();
var monitor = app.appmetrics.monitor();
var semver = require('semver');
app.appmetrics.enable('profiling');

var tap = require('tap');

var skipIfzOS = {};
var skipIfNotzOS = {};
// skip the test if we're testing on z/OS platform
if (process.platform === 'os390') {
  skipIfzOS = {skip: 'Test N/A on z/OS'};
} else {
  skipIfNotzOS = {skip: 'Test N/A on non-z/OS platform'};
}

tap.tearDown(function() {
  app.endRun();
});

tap.test('start returns this', function(t) {
  t.equal(appmetrics, app.appmetrics);
  t.equal(appmetrics, require('../'));
  t.end();
});

tap.test('lrtime is a function or undefined', function(t) {
  var lrtime = app.appmetrics.lrtime;

  if (lrtime) {
    t.doesNotThrow(lrtime, 'callable, not just present');
  } else {
    t.notEqual(process.platform, 'linux', 'lrtime mandatory on linux');
  }
  t.end();
});

tap.test('CPU Data', skipIfzOS, function(t) {
  monitor.once('cpu', function(cpuData) {
    t.ok(isInteger(cpuData.time), 'Timestamp is an integer');
    t.ok(isNumeric(cpuData.process), 'Contains numeric process usage');
    t.ok(isNumeric(cpuData.system), 'Contains numeric total CPU usage');

    cpuData.time = parseInt(cpuData.time);
    cpuData.process = parseFloat(cpuData.process);
    cpuData.system = parseFloat(cpuData.system);

    t.ok(isReasonableTimestamp(cpuData.time), 'time contains current year');
    t.ok(cpuData.system <= 1, 'CPU message contains total CPU usage less than 1');

    // TODO (acollins): Not sure what this does, should it cause a test to fail
    if (cpuData.process > cpuData.total) {
      console.error(
        'WARNING: CPU message contains process CPU usage greater than ' +
          'the total CPU usage (' +
          cpuData.process +
          ' > ' +
          cpuData.system +
          ')'
      );
    }
    t.end();
  });
});

tap.test('Memory Data', function(t) {
  monitor.once('memory', function(memData) {
    // Test if all the memory data values are integers.
    t.ok(isInteger(memData.time), 'Timestamp is an integer');

    t.ok(isInteger(memData.physical_total), 'Total physical memory usage is an integer');

    t.ok(isInteger(memData.physical), 'Physical memory usage is an integer');

    t.ok(isInteger(memData.private), 'Private memory usage is an integer');

    t.ok(isInteger(memData.virtual), 'Virtual memory usage is an integer');

    t.ok(isInteger(memData.physical_free), 'Free physical memory is an integer');

    t.ok(isInteger(memData.physical_used), 'Used physical memory is an integer');

    for (var entry in memData) {
      memData[entry] = parseInt(memData[entry]);
    }

    t.ok(isReasonableTimestamp(memData.time), 'Contains a reasonable timestamp (timestamp year matches current year)');

    // Test if all the memory data values are valid.
    t.ok(memData.physical_total === -1 || memData.physical_total >= 0, 'Contains a valid total memory usage');

    t.ok(memData.physical === -1 || memData.physical >= 0, 'Contains a valid physical memory usage');

    t.ok(memData.private === -1 || memData.private >= 0, 'Contains a valid private memory usage');

    t.ok(memData.virtual === -1 || memData.virtual >= 0, 'Contains a valid virtual memory usage');

    t.ok(memData.physical_free === -1 || memData.physical_free >= 0, 'Contains a valid free physical memory');

    t.ok(memData.physical_used === -1 || memData.physical_used >= 0, 'Contains a valid used physical memory', memData);
    t.end();
  });
});

tap.test('GC Data', function(t) {
  monitor.once('gc', function(gcData) {
    // Test if all the GC data values are integers and type is either M or S.
    t.ok(isInteger(gcData.time), 'Timestamp is an integer');

    const gcTypes = {M: 1, S: 1, I: 1, W: 1};
    t.ok(gcTypes[gcData.type], '"' + gcData.type + '" is an expected GC type');

    t.ok(isInteger(gcData.size), 'Heap size is an integer');

    t.ok(isInteger(gcData.used), 'Used size is an integer');

    t.ok(isInteger(gcData.duration), 'Pause duration is an integer');

    for (var entry in gcData) {
      if (entry != 'type') gcData[entry] = parseInt(gcData[entry]);
    }

    t.ok(isReasonableTimestamp(gcData.time), 'year matches current year');

    // Test if all the GC data values, except type, are valid.
    t.ok(gcData.size > 0, 'Contains a positive heap size');

    t.ok(gcData.used > 0, 'Contains a positive used heap');

    t.ok(gcData.duration >= 0, 'Contains a positive (or 0) pause duration');

    t.ok(gcData.duration < 10000, 'Contains a reasonable pause duration');
    t.end();
  });
});

// This will fixed when we move to json objects for the profiling data
tap.test('Profiling Data', { skip: 'FIXME(@tobespec)' }, function(t) {
  monitor.once('profiling', function(profData) {
    var functions = profData['functions'];

    t.ok(isInteger(profData.time), 'Timestamp is an integer');
    t.ok(
      isReasonableTimestamp(parseInt(profData.time)),
      'Timestamp is a reasonable value (expected to contain current year)'
    );

    testValuesAreIntegers('self');
    testValuesAreIntegers('parent');
    testValuesAreIntegers('line');
    testValuesAreIntegers('count');

    // Parse values of all functions for next tests
    for (var currentFunction in functions) {
      for (var entry in currentFunction) {
        if (entry != 'file' || entry != 'name') currentFunction[entry] = parseInt(currentFunction[entry]);
      }
    }

    testValuesAreGreaterThan('self', 0); // Self can't be 0 as the root can't be a function
    testValuesAreGreaterThan('parent', -1);
    testValuesAreGreaterThan('line', -1);
    testValuesAreGreaterThan('count', -1);
    t.end();

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
  });
});

tap.test('Eventloop Data', function(t) {
  monitor.once('eventloop', function(elData) {
    t.ok(isInteger(elData.time), 'Timestamp is an integer');

    t.ok(
      isReasonableTimestamp(parseInt(elData.time)),
      'Timestamp is a reasonable value (expected to contain current year)'
    );

    for (var elem in elData.latency) {
      t.ok(isNumeric(elData.latency[elem]), 'Contains numeric ' + elem + ' latency value');

      t.ok(elData.latency[elem] > 0, 'Contains positive ' + elem + ' latency value');

      t.ok(elData.latency[elem] <= 5000, 'Contains ' + elem + ' latency value less that 5 seconds');
    }
    t.end();
  });
});

monitor.once('initialized', function() {
  tap.test('Environment Data', function(t) {
    var nodeEnv = monitor.getEnvironment();
    console.log('Got initialized event!');
    console.dir(nodeEnv);
    runNodeEnvTests(nodeEnv, t);
    runCommonEnvTests(nodeEnv, t);
    t.end();
  });
});

function runCommonEnvTests(commonEnvData, t) {
  var ARCHS = ['x86', 'x86_64', 'ppc32', 'ppc64', 'ppc64le', 's390', 's390x'];
  var ZOS_ARCHS = ['3906', '2964', '2965', '2827', '2828', '2817', '2818'];
  var OSES = ['AIX', 'Linux', 'Windows', 'Mac OS X', 'OS/390'];

  t.ok(ARCHS.indexOf(commonEnvData['os.arch']) != -1, 'Contains a recognised value for os.arch', skipIfzOS);
  t.ok(ZOS_ARCHS.indexOf(commonEnvData['os.arch']) != -1, 'Contains a recognised value for z/OS os.arch', skipIfNotzOS);

  var found = false;
  for (var entry in OSES) {
    if (commonEnvData['os.name'].indexOf(OSES[entry]) > -1) {
      found = true;
      break;
    }
  }
  t.ok(found, 'Contains a recognised value for os.name');

  t.match(commonEnvData['os.version'], /\S/, "os.version isn't empty");

  t.ok(isInteger(commonEnvData['pid']), 'pid is an integer');

  t.ok(commonEnvData['pid'] > 1, 'pid is > 1');

  t.match(commonEnvData['native.library.date'], /\S/, "native.library.date isn't empty");

  // NOTE(mjt): jar.version is required from appmetrics v1.0.0 - v1.0.3
  // and is removed in 1.0.4
  if (commonEnvData.hasOwnProperty('jar.version')) {
    // TODO(mjt): Re-enable once corbint fixes env plugin not to send blank
    // jar.version. For now, commenting this out so it doesn't block testing.
    //    assert(/^\d+\.\d+\.\d+\.\d{12}$/.test(commonEnvData['jar.version']),
    //           "Environment message does not have a value for jar.version in a recognised format ("
    //            + commonEnvData['jar.version'] + "), expected 99.99.99.123456789012");
  }

  t.ok(isInteger(commonEnvData['number.of.processors']), 'number.of.processors is an integer', skipIfzOS);

  t.ok(commonEnvData['number.of.processors'] > 0, 'number.of.processors is > 1', skipIfzOS);

  t.match(commonEnvData['command.line'], /\S/, "command.line isn't empty", skipIfzOS);

  var envVarCount = 0;
  var keys = Object.keys(commonEnvData);
  for (var i = 0; i < keys.length; i++) {
    if (/^environment./.test(keys[i])) envVarCount++;
  }
  t.ok(envVarCount > 0, 'Environment data contains enviromnent variable(s)');

  var requiredKeys = [
    'os.arch',
    'os.name',
    'os.version',
    'pid',
    'native.library.date',
    'number.of.processors',
    'command.line',
  ];
  requiredKeys.forEach(function(key) {
    t.ok(commonEnvData.hasOwnProperty(key), 'Environment data contains ' + key);
  });
}

function runNodeEnvTests(nodeEnvData, t) {
  t.match(nodeEnvData['runtime.version'], /^v\d+.\d+.\d+/, "Node version matches 'v99.99.99' format");

  t.ok(
    ['IBM SDK for Node.js', 'Node.js'].indexOf(nodeEnvData['runtime.name']) != -1,
    'Node runtime name is recognised'
  );

  if (nodeEnvData['runtime.vendor']) {
    t.equal(nodeEnvData['runtime.vendor'], 'IBM', 'Node runtime vendor recognised as IBM');
  }

  // NOTE (acollins): This was failing as the current version no. is 1.0.12-dev.201605120942 but test expected it to be 1.0.12-dev.99.201605120942. I've been informed that this is an error with the test so I've changed the regex to reflect this

  if (nodeEnvData['appmetrics.version']) {
    t.match(
      nodeEnvData['appmetrics.version'],
      /^\d+\.\d+\.\d+(-dev)?\.\d{12}$/,
      "Appmetrics version matches '99.99.99(-dev).123456789012' format"
    );
  }

  if (nodeEnvData['agentcore.version']) {
    t.match(
      nodeEnvData['agentcore.version'],
      /^\d+\.\d+\.\d+\.\d{12}$/,
      "Agent core version matches '99.99.99.123456789012' format"
    );
  }

  // NOTE(mjt): heap.size.limit, max.semi.space.size and max.old.space.size were added in
  // appmetrics 1.0.4 (required field in this version onwards)
  // NOTE(ignasbol): max.heap.size included as well as part of 1.0.4
  if (nodeEnvData['heap.size.limit']) {
    t.ok(
      isInteger(nodeEnvData['heap.size.limit']),
      'heap.size.limit is an integer (value was: ' + nodeEnvData['heap.size.limit'] + ')'
    );

    t.ok(parseInt(nodeEnvData['heap.size.limit']) > 0, 'heap.size.limit is positive');
    t.ok(
      isInteger(nodeEnvData['max.semi.space.size']),
      'max.semi.space.size is an integer (value was: ' + nodeEnvData['max.semi.space.size'] + ')'
    );
    t.ok(parseInt(nodeEnvData['max.semi.space.size']) > 0, 'max.semi.size is positive');

    t.ok(
      isInteger(nodeEnvData['max.old.space.size']),
      'max.old.space.size is an integer (value was: ' + nodeEnvData['max.old.space.size'] + ')'
    );
    t.ok(parseInt(nodeEnvData['max.old.space.size']) > 0, 'max.old.space.size is positive');

    if (semver.gt(process.version, '6.5.0')) {
      // issue 283
      t.ok(
        2 * parseInt(nodeEnvData['max.semi.space.size']) + parseInt(nodeEnvData['max.old.space.size']) ===
          parseInt(nodeEnvData['heap.size.limit']),
        'Values for max.old.space.size and max.semi.space.size match heap.size.limit'
      );
    } else {
      t.ok(
        4 * parseInt(nodeEnvData['max.semi.space.size']) + parseInt(nodeEnvData['max.old.space.size']) ===
          parseInt(nodeEnvData['heap.size.limit']),
        'Values for max.old.space.size and max.semi.space.size match heap.size.limit'
      );
    }

    t.ok(
      isInteger(nodeEnvData['max.heap.size']),
      'max.heap.size is an integer (value was: ' + nodeEnvData['max.heap.size'] + ')'
    );

    t.ok(parseInt(nodeEnvData['max.heap.size']) > 0, 'max.heap.size is positive');
  }

  var requiredKeys = ['runtime.version', 'runtime.name', 'command.line.arguments'];
  requiredKeys.forEach(function(key) {
    t.ok(nodeEnvData.hasOwnProperty(key), 'Node environment data contains ' + key);
  });
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
