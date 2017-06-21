/*******************************************************************************
 * Copyright 2017 IBM Corp.
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

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
var appmetrics = (appmetrics = require('../../'));
var monitor = appmetrics.monitor();
var server = require('../test_https_server').server;
var https = require('https');

var tap = require('tap');

tap.plan(3);

tap.tearDown(function() {
  setTimeout(function() {
    server.close();
  }, 1000);
});

var completedTests = 0;

monitor.on('https-outbound', function(data) {
  if (completedTests < 3) {
    tap.test('HTTPS Outbound Event', function(t) {
      checkHttpOutboundData(data, t);
      t.end();
      completedTests++;
    });
  }
});

function checkHttpOutboundData(data, t) {
  t.ok(isInteger(data.time), 'Timestamp is an integer');
  t.equals(data.method, 'GET', 'Should report GET as HTTP request method');
  t.equals(data.url, 'https://localhost:8000/', 'Should report https://localhost:8000/ as URL');
  if (data.requestHeaders) {
    t.equals(data.requestHeaders.hello, 'world', 'Should report world as value of hello header');
  }
}

function isInteger(n) {
  return isNumeric(n) && n % 1 == 0;
}

function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

var options = {
  host: 'localhost',
  port: 8000,
  headers: {
    hello: 'world',
  },
};

// Request with a callback
https.get('https://localhost:8000/', function(res) {});

// Request without a callback
https.get('https://localhost:8000/');

// Request with headers
https.request(options).end();
