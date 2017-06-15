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

/* A test for the appmetrics axon probe.
 * A self contained test that calls makes calls to and from local sockets.
 *
 * It tests that user the probes are triggered for every function
 * and that user call backs to axon calls are run correctly.
 *
 * Debug code is included commented out for use if the test fails.
 */

var appmetrics = require('appmetrics');
var process = require('process');

var methodpairs = {
  pushpull: { send: 'push', receive: 'pull' },
  pubsub: { send: 'pub', receive: 'sub' },
  topicpubsub: { send: 'pub', receive: 'sub' },
  reqrep: { send: 'req', receive: 'rep' },
  pubemitsubemit: { send: 'pub-emitter', receive: 'sub-emitter' },
};

var messagecounts = {};
var eventcounts = {};

var TESTCOUNT = 10;

var monitoring = appmetrics.monitor();
monitoring.on('axon', function(data) {
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

// Require axon after appmetrics so it is instrumented.
var axon = require('axon');

/* Setup the sockets for our different test modes then sent the messages
 * under the same setInterval call.
 */

// Modes: Push/Pull, Pub/Sub, Req/Rep and PubEmitter/SubEmitter

// Push / Pull - 'push' and 'pull' sock.send(msg) and sock.on('message', ...)

var pushpullnum = 3000;

var pushsock = axon.socket('push');

pushsock.bind(pushpullnum);
console.log('push server started');

var pullsock = axon.socket('pull');

pullsock.connect(pushpullnum);

messagecounts[methodpairs.pushpull.receive] = 0;

pullsock.on('message', function(msg) {
  //	console.log('pullsock received: '+ msg);
  messagecounts[methodpairs.pushpull.receive]++;
  if (count == TESTCOUNT) {
    pullsock.close();
    pushsock.close();
  }
});

// Pub / Sub - 'pub' and 'sub' sock.send(msg) and sock.on('message', ....) as well as sock.subscribe('testtopic')

var pubsubnum = 3001;

var pubsock = axon.socket('pub');

pubsock.bind(pubsubnum);
console.log('pub server started');

var subsock = axon.socket('sub');

subsock.connect(pubsubnum);

messagecounts[methodpairs.pubsub.receive] = 0;

subsock.on('message', function(msg) {
  //	console.log('subsock received: '+ msg);
  messagecounts[methodpairs.pubsub.receive]++;
  if (count == TESTCOUNT) {
    subsock.close();
    pubsock.close();
  }
});

/** Setup a pub/sub pair with a subscription. **/
var topicpubsubnum = 3002;
var topicpubsock = axon.socket('pub');

topicpubsock.bind(topicpubsubnum);
console.log('pub server started');

var topicsubsock = axon.socket('sub');

topicsubsock.connect(topicpubsubnum);

topicsubsock.subscribe('testtopic1');

topicsubsock.on('message', function(topic, msg) {
  //	console.log('topicsubsock received: '+ msg);
  messagecounts[methodpairs.topicpubsub.receive]++;
  if (count == TESTCOUNT) {
    topicsubsock.close();
    topicpubsock.close();
  }
});

// Req / Rep - 'req' and 'rep' sock.send(msg, func(response) ) and sock.on('message', ....)

var reqrepnum = 3003;

var reqsock = axon.socket('req');

reqsock.bind(reqrepnum);
console.log('req server started');

var repsock = axon.socket('rep');

repsock.connect(reqrepnum);

messagecounts[methodpairs.reqrep.receive] = 0;

repsock.on('message', function(message, count, reply) {
  //	console.log('repsock received: '+ message + " " + count);
  messagecounts[methodpairs.reqrep.receive]++;
  reply(count);
});

// PubEmitter / SubEmitter - 'pub-emitter' and 'sub-emitter' - sock.emit('event-name', json_msg) and sock.on(msg, ....);

var pubemitsubemitnum = 3004;

var pubemitsock = axon.socket('pub-emitter');

pubemitsock.bind(pubemitsubemitnum);
console.log('pub-emitter server started');

var subemitsock = axon.socket('sub-emitter');

subemitsock.connect(pubemitsubemitnum);

messagecounts[methodpairs.pubemitsubemit.receive] = 0;

subemitsock.on('testtopic2', function(msg) {
  //	console.log('sub-emitter received: '+ msg +  ' count: ' + count);
  messagecounts[methodpairs.pubemitsubemit.receive]++;
  if (count == TESTCOUNT) {
    subemitsock.close();
    pubemitsock.close();
  }
});

/* Create the message sending loop and
 * send all our messages.
 */
var count = 0;

messagecounts[methodpairs.pushpull.send] = 0;
messagecounts[methodpairs.pubsub.send] = 0;
messagecounts[methodpairs.topicpubsub.send] = 0;
messagecounts[methodpairs.reqrep.send] = 0;
messagecounts[methodpairs.pubemitsubemit.send] = 0;

var intervalId = setInterval(function() {
  count++;
  if (count == TESTCOUNT) {
    clearInterval(intervalId);
  }
  pushsock.send('pushpulltest', count);
  messagecounts[methodpairs.pushpull.send]++;

  pubsock.send('pubsubtest', count);
  messagecounts[methodpairs.pubsub.send]++;

  topicpubsock.send('testtopic1', { message: 'topicpubsubtest' });
  messagecounts[methodpairs.topicpubsub.send]++;

  pubemitsock.emit('testtopic2', 'pubemitsubemittest');
  messagecounts[methodpairs.pubemitsubemit.send]++;

  /* Increment the message count in the reply function to confirm the callback works. */
  reqsock.send('reqreptest', count, function(reply_count) {
    messagecounts[methodpairs.reqrep.send]++;
    //		console.log("Reply was: " + reply_count);
    // Close the sockets on this side once we receive the last reply.
    // (Use the returned count as our count may be 10 before any replies are sent.)
    if (reply_count == TESTCOUNT) {
      repsock.close();
      reqsock.close();
    }
  });
}, 150);

/** * End ***/
