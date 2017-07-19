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

// This script tests the client pooling functionality of the pg module.
// It assumes a postgres server is running on the local host.

var appmetrics = require('appmetrics');

// Live monitoring
var amapi = appmetrics.monitor();

// Testing variables
var actualEvents = 0;
var expectedEvents = 0;
var connections = [];

// Log all postgres events
amapi.on('postgres', function(response) {
  actualEvents++;

  // Debugging
  // var readableDate = new Date(response.time);
  // console.log("Time of query: "+readableDate.toString());
  // console.log("SQL Query: "+response.query);
  // console.log("Duration: "+response.duration);
});

var pg = require('pg');
var conString = 'postgres://postgres:password@localhost/postgres';

// Set client pool size down to 2 and
// set timeout to 1 second for testing
pg.defaults.poolSize = 2;
pg.defaults.poolIdleTimeout = 1000;

// Make multiple calls to pg.connect in order to get a new client
// Because the poolSize is low, the clients in the pool will be reused
var numberOfConnections = 20;
for (var i = 0; i < numberOfConnections; i++) {
  makeANewConnection(i);
}

// Function to create a new client connection
function makeANewConnection(index) {
  // Add to connections array
  connections.push({ number: index, returned: false });

  pg.connect(conString, function(err, client, done) {
    // Make multiple queries on this client
    // Here we will make 9 queries, so we expect to see 9 events
    // emited for this client.
    // Make three asynchronous sets of three synchronous queries
    var FIRST_BLOCK_RETURNED = false;
    var SECOND_BLOCK_RETURNED = false;
    var THIRD_BLOCK_RETURNED = false;

    makeQuery(err, client, done, function() {
      makeQuery(err, client, done, function() {
        makeQuery(err, client, done, function() {
          blockReturned(0, index);
        });
      });
    });

    makeQuery(err, client, done, function() {
      makeQuery(err, client, done, function() {
        makeQuery(err, client, done, function() {
          blockReturned(1, index);
        });
      });
    });

    makeQuery(err, client, done, function() {
      makeQuery(err, client, done, function() {
        makeQuery(err, client, done, function() {
          blockReturned(2, index);
        });
      });
    });

    function blockReturned(blockNumber, index) {
      if (blockNumber == 0) {
        FIRST_BLOCK_RETURNED = true;
      } else if (blockNumber == 1) {
        SECOND_BLOCK_RETURNED = true;
      } else if (blockNumber == 2) {
        THIRD_BLOCK_RETURNED = true;
      }

      // Callback for this connection
      if (FIRST_BLOCK_RETURNED && SECOND_BLOCK_RETURNED && THIRD_BLOCK_RETURNED) {
        finishedTesting(index);
      }
    }
  });
}

// Callback function which is called when a connection is finished
function finishedTesting(connectionNumber) {
  // Find key in connections object that matches this number
  for (var i = 0; i < connections.length; i++) {
    if (connections[i].number == connectionNumber) {
      connections[i].returned = true;
      break;
    }
  }

  // Now check them all
  var finished = true;
  for (var j = 0; j < connections.length; j++) {
    if (connections[j].returned != true) {
      finished = false;
      break;
    }
  }

  if (finished) {
    console.log('Expected Number of events: ' + expectedEvents);
    console.log('Actual Number of events: ' + actualEvents);
  }
}

// Function to make an individual query on a client
function makeQuery(err, client, done, callback) {
  // Increment expected number of events
  expectedEvents++;

  if (err) {
    return console.error('error fetching client from pool', err);
  }

  client.query('SELECT $1::int AS number', ['1'], function(err, result) {
    // call `done()` to release the client back to the pool
    done();

    if (err) {
      return console.error('error running query', err);
    }

    // console.log(result.rows[0].number);
    // output: 1
    if (callback != null) {
      callback();
    }
  });
}
