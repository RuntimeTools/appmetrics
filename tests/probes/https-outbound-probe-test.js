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
var appmetrics = require('../../');
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

monitor.on('https-outbound', function(data) {
  tap.test('HTTPS Outbound Event', function(t) {
    checkHttpOutboundData(data, t);
    t.end();
  });
});

function checkHttpOutboundData(data, t) {
  t.ok(isInteger(data.time), 'Timestamp is an integer');
  t.equals(data.method, 'GET', 'Should report GET as HTTP request method');
  t.equals(data.url, `https://localhost:${server.address().port}/`,
    `Should report https://localhost:${server.address().port}/ as URL`);
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
  port: server.address().port,
  headers: {
    hello: 'world',
  },
};

// Request with a callback
https.get(`https://localhost:${server.address().port}/`, function(res) {});

// Request without a callback
https.get(`https://localhost:${server.address().port}/`);

// Request with headers
https.request(options).end();
