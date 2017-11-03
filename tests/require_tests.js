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

var tap = require('tap');

// Regression test for issue #375
tap.test('Calling require without start should not break', function(t) {
  require('../');
  var server = require('./test_http_server').server;
  var http = require('http');

  // HTTP outbound request
  // (previously triggered http-outbound probe to emit an event which caused a SIGSEGV)
  http.get(`http://localhost:${server.address().port}/`, function(res) {
    server.close();
    t.end();
  });
});

tap.test('Appmetrics should be a global singleton', function(t) {
  var appmetrics = require('../');
  // Delete cached module
  delete require.cache[require.resolve('../')];
  var appmetrics2 = require('../');
  t.equals(appmetrics, appmetrics2);
  t.end();
});
