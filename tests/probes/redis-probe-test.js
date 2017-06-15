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

/* A test for the appmetrics redis probe.
 * It assumes a redis server is running on the local host.
 *
 * It tests that user the probes are triggered for every function
 * and that user call backs to redis commands are run correctly.
 *
 * Debug code is included commented out for if the test fails.
 */

var assert = require('assert');
var results = {};
var actualProbeCounts = {};
var expectedProbeCounts = {};
var exitCode = 0;

/* Setup tracking so we know how many metric events ought to have fired
 * and can validate that we instrumented methods correctly.
 */
function addExpectedEvent(method) {
  //	console.log('Adding expected call to method: ' + method);
  if (!expectedProbeCounts[method]) {
    expectedProbeCounts[method] = 0;
    actualProbeCounts[method] = 0;
  }
  expectedProbeCounts[method]++;
  //	console.log('Expected calls to method: ' + method + ' now '
  //			+ expectedProbeCounts[method]);
}

/* Check the test results on exit and report any failures.
 */
process.on('exit', function(code) {
  console.log('*** TEST EXITING - Results:');

  var probesPassed = true;
  for (var method in actualProbeCounts) {
    if (expectedProbeCounts[method] !== actualProbeCounts[method]) {
      console.log(
        '** Counts for ' +
          method +
          ' did not match, expected ' +
          expectedProbeCounts[method] +
          ' actual ' +
          actualProbeCounts[method]
      );
      probesPassed = false;
    } else {
      // Uncomment this when debugging.
      //			console.log('Counts for ' + method + ' matched, expected '
      //					+ expectedProbeCounts[method] + ' actual '
      //					+ actualProbeCounts[method]);
    }
  }
  if (!probesPassed) {
    console.log('Some probes failed to fire. - FAIL');
  } else {
    console.log('All expected probes fired. - PASS');
  }

  var passCount = 0;
  var failCount = 0;
  for (var test in results) {
    //		console.log(test + ': \t' + results[test]);
    if (!results[test]) {
      // Make sure we exit with an error if a test failed.
      console.log('Callback test failure: ' + test);
      failCount++;
    } else {
      passCount++;
    }
  }
  var totalCount = passCount + failCount;
  if (failCount > 0) {
    console.log(passCount + ' / ' + totalCount + ' callbacks ran. - FAIL');
  } else {
    console.log(passCount + ' / ' + totalCount + ' callbacks ran. - PASS');
  }
  process.exit(exitCode);
});

var appmetrics = require('appmetrics');

var monitoring = appmetrics.monitor();

/* A standard callback we can use to confirm when tests have run. */
monitoring.on('redis', function(data) {
  actualProbeCounts[data.cmd]++;
  // Uncomment these when debugging.
  //	console.log('*** Probe callback ***');
  //	console.dir(data, {colors:true, depth:null});
  //	console.log('[method: ' + data.method + ']');
  //	console.log('\t[time: ' + data.time + ']');
  //	console.log('\t[duration: ' + data.duration + ']');
  //	console.log('Incrementing calls for method ' + data.method);
  //	console.log('Callback for method ' + data.method + ' called');
});

console.log('Requiring redis');

var redis = require('redis');

if (!redis.__probeAttached__) {
  console.log('Test failed - redis was not instrumented.');
  //	process.exit(1);
} else {
  console.log('Test passed - redis was instrumented.');
}
console.log('Beginning tests');

/* Connecting the client triggers an info command. */
addExpectedEvent('info');
var client = redis.createClient();

/*
 * Test both lower and upper case basic commands
 */
console.log('Async calls');
results['set_test'] = false;
addExpectedEvent('set');
client.set('akey', 'somevalue', function(err, reply) {
  assert.ifError(err);
  results['set_test'] = true;
});

results['SET_TEST'] = false;
addExpectedEvent('set');
client.SET('AKEY', 'SOMEVALUE', function(err, reply) {
  assert.ifError(err);
  results['SET_TEST'] = true;
});

results['get_test'] = false;
addExpectedEvent('get');
client.get('akey', function(err, reply) {
  assert.ifError(err);
  results['get_test'] = true;
});

results['GET_TEST'] = false;
addExpectedEvent('get');
client.GET('AKEY', function(err, reply) {
  assert.ifError(err);
  results['GET_TEST'] = true;
});
console.log('Async calls done.');

/*
 * Test basic commands without callbacks.
 */
console.log('Sync calls');

addExpectedEvent('set');
client.set('akey', 'somevalue');

addExpectedEvent('set');
client.SET('AKEY', 'SOMEVALUE');

addExpectedEvent('get');
client.get('akey');

addExpectedEvent('get');
client.GET('AKEY');

console.log('Sync calls done.');

/*
 * Test batch commands with and without callbacks.
 * Assuming batch objects aren't safe for re-use.
 */
var batchObject1 = client.batch();

results['batch_test'] = false;
addExpectedEvent('batch.exec');
batchObject1.set('batchkey', 'batchvalue');
batchObject1.get('batchkey');
batchObject1.exec(function(err, reply) {
  assert.ifError(err);
  results['batch_test'] = true;
});

var batchObject2 = client.batch();

addExpectedEvent('batch.exec');
batchObject2.set('batchkey', 'batchvalue2');
batchObject2.get('batchkey');
batchObject2.exec();

var batchObject3 = client.batch();

results['BATCH_TEST'] = false;
addExpectedEvent('batch.exec');
batchObject3.set('BATCHKEY', 'BATCHVALUE');
batchObject3.get('BATCHKEY');
batchObject3.EXEC(function(err, reply) {
  assert.ifError(err);
  results['BATCH_TEST'] = true;
});

var batchObject4 = client.BATCH();

addExpectedEvent('batch.exec');
batchObject4.set('BATCHKEY', 'BATCHVALUE2');
batchObject4.get('BATCHKEY');
batchObject4.EXEC();

/*
 * Test mutli commands with and without callbacks.
 * Assuming multi objects aren't safe for re-use.
 */
var multiObject1 = client.multi();

results['multi_test'] = false;
addExpectedEvent('multi.exec');
multiObject1.set('multikey', 'multivalue');
multiObject1.get('multikey');
multiObject1.exec(function(err, reply) {
  assert.ifError(err);
  results['multi_test'] = true;
});

var multiObject2 = client.multi();

addExpectedEvent('multi.exec');
multiObject2.set('multikey', 'multivalue2');
multiObject2.get('multikey');
multiObject2.exec();

var multiObject3 = client.MULTI();

results['MULTI_TEST'] = false;
addExpectedEvent('multi.exec');
multiObject3.set('MULTIKEY', 'MULTIVALUE');
multiObject3.get('MULTIKEY');
multiObject3.EXEC(function(err, reply) {
  assert.ifError(err);
  results['MULTI_TEST'] = true;
});

var multiObject4 = client.MULTI();

addExpectedEvent('multi.exec');
multiObject4.set('MULTIKEY', 'MULTIVALUE2');
multiObject4.get('MULTIKEY');
multiObject4.EXEC();

/* Terminate the client and allow the script to exit.
 * process.on('exit', ...) will be called and we will
 * report whether the test passed.
 */
addExpectedEvent('quit');
client.quit();

/* Test pub/sub monitoring */
addExpectedEvent('info');
var subClient = redis.createClient();
addExpectedEvent('info');
var pubClient = redis.createClient();

console.log('Setting up pub/sub:');

subClient.on('subscribe', function(channel, count) {
  addExpectedEvent('publish');
  results['publish_test'] = false;
  pubClient.publish('channel 1', 'message 1', function() {
    results['publish_test'] = true;
  });

  addExpectedEvent('publish');
  results['PUBLISH_TEST'] = false;
  pubClient.publish('channel 1', 'message 1', function() {
    results['PUBLISH_TEST'] = true;
  });

  addExpectedEvent('publish');
  pubClient.publish('channel 1', 'message 2');
  addExpectedEvent('publish');
  pubClient.PUBLISH('channel 1', 'last message');
});

var msg_count = 0;
subClient.on('message', function(channel, message) {
  msg_count += 1;
  if (msg_count === 3) {
    addExpectedEvent('unsubscribe');
    subClient.unsubscribe();
    addExpectedEvent('quit');
    subClient.quit();
    addExpectedEvent('quit');
    pubClient.QUIT();
  }
});

results['subscribe_test'] = false;
addExpectedEvent('subscribe');
subClient.subscribe('channel 1', function() {
  results['subscribe_test'] = true;
});
console.log('Pub/sub tests started.');
