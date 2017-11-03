/*******************************************************************************
 * Copyright 2017 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 ******************************************************************************/
'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
var appmetrics = require('../../');
var monitor = appmetrics.monitor();
var server = require('../test_https_server').server;
var https = require('https');

var tap = require('tap');

tap.plan(5);

tap.tearDown(function() {
  server.close();
});

var completedTests = 0;

monitor.on('https', function(data) {
  // First 3 calls should have an 'https' event emitted, then 2 'request' events,
  // so don't allow more than 3 tests to run here.
  if (completedTests < 3) {
    tap.test('HTTPS Event', function(t) {
      checkHttpsData(data, t);
      t.end();
      completedTests++;
    });
  }
});

monitor.on('request', function(data) {
  tap.test('HTTPS Request Event', function(t) {
    checkHttpsRequestData(data.request.context, t);
    t.end();
  });
});

function checkHttpsData(data, t) {
  t.ok(isInteger(data.time), 'Timestamp is an integer');
  t.equals(data.method, 'GET', 'Should report GET as HTTPS request method');
  t.equals(data.url, '/', 'Should report / as URL');
  t.equals(data.hasOwnProperty('duration'), true, 'Should have HTTPS property duration;');
  t.ok(isNumeric(data.duration), 'duration is a number');
  t.equals(data.hasOwnProperty('header'), true, 'Should have HTTPS property header;');
  t.equals(data.hasOwnProperty('statusCode'), true, 'Should have HTTPS property statusCode;');
  t.ok(isInteger(data.statusCode), 'statusCode is an integer');
  t.equals(data.hasOwnProperty('contentType'), true, 'Should have HTTPS property contentType;');
  t.equals(data.hasOwnProperty('requestHeader'), true, 'Should have HTTPS property requestHeader;');
}

function checkHttpsRequestData(data, t) {
  t.equals(data.method, 'GET', 'Should report GET as HTTPS request method');
  t.equals(data.url, '/', 'Should report / as URL');
  t.equals(data.hasOwnProperty('statusCode'), true, 'Should have HTTPS property statusCode;');
  t.ok(isInteger(data.statusCode), 'statusCode is an integer');
  t.equals(data.hasOwnProperty('requestHeader'), true, 'Should have HTTPS property requestHeader;');
  t.equals(data.hasOwnProperty('header'), true, 'Should have HTTPS property header;');
  t.equals(data.hasOwnProperty('contentType'), true, 'Should have HTTPS property contentType;');
}

function isInteger(n) {
  return isNumeric(n) && n % 1 == 0;
}

function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

// Request with a callback
https.get(`https://localhost:${server.address().port}/`, function(res) {});

// Request without a callback
https.get(`https://localhost:${server.address().port}/`);

var options = {
  host: 'localhost',
  port: server.address().port,
  headers: {
    hello: 'world',
  },
};

// Request with headers
https.request(options).end();

setTimeout(function() {
  // Enable requests
  monitor.enable('requests');
  monitor.disable('https');

  // Request with a callback
  https.get(`https://localhost:${server.address().port}/`, function(res) {});

  // Request without a callback
  https.get(`https://localhost:${server.address().port}/`);
}, 2000);
