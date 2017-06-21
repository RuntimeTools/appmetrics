/*******************************************************************************
 * Copyright 2016 IBM Corp.
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

/* A test for the appmetrics strong-mq probe.
 * A self contained test that calls makes calls to and from local sockets.
 *
 * It tests that user the probes are triggered for every function
 * and that user call backs to strong-mq calls are run correctly.
 *
 * Debug code is included commented out for use if the test fails.
 */

var appmetrics = require('appmetrics');
var process = require('process');

var methodpairs = {
  pushpull: { send: 'push', receive: 'pull' },
  pubsub: { send: 'pub', receive: 'sub' },
};

var messagecounts = {};
var eventcounts = {};

var TESTCOUNT = 10;

var monitoring = appmetrics.monitor();
monitoring.on('strong-mq', function(data) {
  //	console.dir(data);
  if (!eventcounts[data.type]) {
    eventcounts[data.type] = 0;
  }
  eventcounts[data.type]++;
});

/* Check the test results on exit and report any failures.
 */
process.on('exit', function(code) {
  console.log('*** TEST EXITING - Results:');

  //	console.dir( messagecounts );

  // Check messages sent/received from each source matches.
  var sentreceivedpassed = true;
  for (var type in methodpairs) {
    var methods = methodpairs[type];
    if (messagecounts[methods.send] != messagecounts[methods.receive]) {
      console.log(
        '** Counts for ' +
          methods.send +
          ' and ' +
          methods.receive +
          ' did not match, sent ' +
          messagecounts[methods.send] +
          ' received ' +
          messagecounts[methods.receive]
      );
      sentreceivedpassed = false;
    } else {
      //			console.log('** Counts for ' + methods.send + " and " + methods.receive + ' matched, sent '
      //					+ messagecounts[methods.send] + ' received '
      //					+ messagecounts[methods.receive]);
    }
  }
  if (!sentreceivedpassed) {
    console.log('Not all messages sent and received. - FAIL');
  } else {
    console.log('All messages sent and received. - PASS');
  }
  // Check monitored events from each source matches messages sent/received.

  //	console.dir( eventcounts );

  var eventcountspassed = true;
  for (var pair in methodpairs) {
    for (var method in methodpairs[pair]) {
      var name = methodpairs[pair][method];
      if (messagecounts[name] != eventcounts[name]) {
        console.log(
          '** Counts for ' +
            name +
            ' calls and ' +
            name +
            ' events did not match, sent ' +
            messagecounts[name] +
            ' received ' +
            eventcounts[name]
        );
        eventcountspassed = false;
      } else {
        //				console.log('** Counts for ' + name + " calls and " + name + ' events matched, sent '
        //						+ messagecounts[name] + ' received '
        //						+ eventcounts[name]);
      }
    }
  }
  if (!eventcountspassed) {
    console.log('Not all messages triggered events. - FAIL');
  } else {
    console.log('All messages triggered events. - PASS');
  }
});

// Require strong-mq after appmetrics so it is instrumented.
var strong_mq = require('strong-mq');

/* Setup the sockets for our different test modes then sent the messages
 * under the same setInterval call.
 */

// Modes: Push/Pull, Pub/Sub

// Push / Pull - 'push' and 'pull' sock.publish(msg) and sock.on('message', ...)

var pushpullconnection = strong_mq.create('native://localhost').open();

var push = pushpullconnection.createPushQueue('pushpullqueue');

var pull = pushpullconnection.createPullQueue('pushpullqueue');

messagecounts[methodpairs.pushpull.receive] = 0;

pull.subscribe(function(msg) {
  //	console.log('pull received: '+ msg);
  messagecounts[methodpairs.pushpull.receive]++;
  if (count == TESTCOUNT) {
    pull.close();
    push.close();
  }
});

// Pub / Sub - 'pub' and 'sub' sock.publish(msg) and sock.on('message', ....) as well as sock.subscribe('testtopic')

var pubsubconnection = strong_mq.create('native://localhost').open();

var pub = pubsubconnection.createPubQueue('pubsubqueue');

var sub = pubsubconnection.createSubQueue('pubsubqueue');

messagecounts[methodpairs.pubsub.receive] = 0;

sub.subscribe('pub.sub.test').on('message', function(msg) {
  //	console.log('sub received: '+ msg);
  messagecounts[methodpairs.pubsub.receive]++;
  if (count == TESTCOUNT) {
    pub.close();
    sub.close();
  }
});

/* Create the message sending loop and
 * send all our messages.
 */
var count = 0;

messagecounts[methodpairs.pushpull.send] = 0;
messagecounts[methodpairs.pubsub.send] = 0;

var intervalId = setInterval(function() {
  count++;
  if (count == TESTCOUNT) {
    clearInterval(intervalId);
  }
  push.publish(count);
  messagecounts[methodpairs.pushpull.send]++;

  pub.publish(count, 'pub.sub.test');
  messagecounts[methodpairs.pubsub.send]++;
}, 150);

/** * End ***/
