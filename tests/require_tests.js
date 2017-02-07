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
 
var tap = require('tap');

// Regression test for issue #375
tap.test('Calling require without start should not break', function(t) {
    var appmetrics = require('../');
    var server = require('./test_http_server').server;
    var http = require('http');

    // HTTP outbound request 
    // (previously triggered http-outbound probe to emit an event which caused a SIGSEGV)
    http.get('http://localhost:8000', function (res) {server.close(); t.end();});
});
