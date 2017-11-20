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

// This script tests the client instance functionality of the couchnode module.
var appmetrics = require('appmetrics');
var tap = require('tap');

// Live monitoring
var amapi = appmetrics.monitor();

// Testing variables
var actualEvents = 0;
var expectedEvents = 2;

// all cb events
amapi.on('couchbase', function(response) {
  actualEvents++;
});

var couchbase = require('couchbase').Mock;
var cluster = new couchbase.Cluster();
var bucket = cluster.openBucket();

bucket.upsert('testdoc', {name:'Frank'}, function(err, result) {
  if (err) throw err;

  bucket.get('testdoc', function(err, result) {
    if (err) throw err;

    console.log(result.value);
    // {name: Frank}

    tap.equals(actualEvents, expectedEvents, 'the callback was not called');
  });
});
