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

/* A test for the appmetrics MongoDB probe.
 * It assumes MongoDB is running on the local host.
 */

var appmetrics = require('appmetrics');

var monitoring = appmetrics.monitor();

var mongo = require('mongodb');
var client = mongo.MongoClient;

var tap = require('tap');
var assert = require('assert');

tap.plan(13);

tap.test('probe attached', function(t) {
  t.ok(mongo.__ddProbeAttached__);
  t.end();
});

monitoring.on('mongo', function(data) {
  console.log('mongo probe emitted ' + data.method);
  tap.test(data.method, function(t) {
    t.equal(data.collection, 'documents', 'collection name should be provided');
    switch (data.method) {
      case 'insertMany':
        t.equal(data.count, 3, 'should have inserted 3 documents');
        break;
      case 'insertOne':
        t.equal(data.count, 1, 'should have inserted 1 document');
        break;
      case 'bulkWrite':
        t.equal(data.count, 2, 'should have modified 2 documents');
        break;
      case 'deleteMany':
        t.equal(data.count, 1, 'should have deleted 1 document');
        break;
      case 'deleteOne':
        t.equal(data.count, 1, 'should have deleted 1 document');
        break;
      case 'find':
        t.equal(data.count, 3, 'should have found 3 documents');
        break;
      case 'count':
        t.equal(data.count, 3, 'should have found 3 documents');
        break;
      case 'indexes':
        t.equal(data.count, 2, 'should have found 2 indexes');
        break;
    }

    t.end();
  });
});

function run() {
  // Connection OneURL
  var url = 'mongodb://localhost:27017/myproject';
  // Use connect method to connect to the Server
  client.connect(url, function(err, db) {
    assert.ifError(err);
    console.log('Connected correctly to server');

    // Get the documents collection
    var collection0 = db.collection('documents');
    // Insert some documents
    collection0.insertOne({ b: 1 }, function(err, result) {
      assert.ifError(err);
      console.log('Inserted 1 document into the document collection');
      collection0.drop(function(err, result) {
        assert.ifError(err);
        var collection = db.collection('documents');
        // Insert some documents
        collection.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }], function(err, result) {
          assert.ifError(err);
          console.log('Inserted 3 documents into the document collection');
          collection.createIndex({ a: 2 }, { unique: true, background: true, w: 1 }, function(err, indexName) {
            assert.ifError(err);
            collection.indexes(function(err, indexes) {
              assert.ifError(err);
              collection.dropIndexes(function(err, indexes) {
                assert.ifError(err);
                var res = collection.find();

                res.toArray(function(err, docs) {
                  assert.ifError(err);
                  collection.count(function(err, count) {
                    assert.ifError(err);
                    if (err) {
                      console.log(err);
                    } else {
                      console.log('counted ' + count + ' documents');
                    }
                    // Delete
                    collection.deleteOne({ a: 1 }, function(err, result) {
                      assert.ifError(err);
                      console.log('Deleted 1 document from the document collection');
                      collection.deleteMany({ a: 2 }, function(err, result) {
                        assert.ifError(err);
                        // console.log(err);
                        console.log('Deleted 2 documents from the document collection');

                        collection.bulkWrite(
                          [{ insertOne: { document: { c: 1 } } }, { deleteOne: { filter: { c: 1 } } }],
                          function(err, result) {
                            assert.ifError(err);
                            console.log('Did a bulk write with one insert and one delete');
                            db.close();
                          }
                        );
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

run();
