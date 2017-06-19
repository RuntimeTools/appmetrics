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

/*
 * Allow objects with circularities to be flattened/serialized.
 * This is achieved by replacing references to already seen objects with 'CIRCULAR-' + id
 */
var CIRCULAR = 'CIRCULAR-';

exports.serialize = function(obj, objCache, id) {
  var newObj = {};

  /*
   * Add the head object to the cache
   */
  if (typeof objCache === 'undefined') {
    objCache = [];
    objCache.push(obj);
    newObj.idCount = 0;
  }

  if (typeof id !== 'undefined') {
    newObj.idCount = id;
  }
  /*
   * Walk values in object
   */
  for (var prop in obj) {
    if (obj.hasOwnProperty(prop)) {
      /*
       * Need to find object references
       */
      if (typeof obj[prop] === 'object' && obj[prop] !== null) {
        /*
         * Check if its an array
         */
        if (Array.isArray(obj[prop])) {
          if (obj[prop].length == 0) {
            newObj[prop] = obj[prop];
          } else {
            newObj[prop] = [];
            for (var idx = 0; idx < obj[prop].length; idx++) {
              id = objCache.indexOf(obj[prop][idx]);
              if (id > -1) {
                /*
                 * Found an entry, so replace obj[prop] with a reference
                 */
                newObj[prop][idx] = CIRCULAR + id;
              } else {
                /*
                 * Not found, so push it to the cache and serialize
                 */

                objCache.push(obj[prop][idx]);
                newObj[prop][idx] = exports.serialize(obj[prop][idx], objCache, objCache.indexOf(obj[prop][idx]));
              }
            }
          }
        } else {
          // Got a normal object. Check to see if we've seen it before
          id = objCache.indexOf(obj[prop]);
          if (id > -1) {
            // Found an entry, so replace obj[prop] with a reference
            newObj[prop] = CIRCULAR + id;
          } else {
            // Not found, so push it to the cache and serialize

            objCache.push(obj[prop]);
            newObj[prop] = exports.serialize(obj[prop], objCache, objCache.indexOf(obj[prop]));
          }
        }
      } else {
        newObj[prop] = obj[prop];
      }
    }
  }
  if (newObj.idCount == 0) {
    return JSON.stringify(newObj);
  } else {
    return newObj;
  }
};

/*
 * Reverse the serialization, inflating CIRCULAR + id to a reference to the object
 */
exports.deserialize = function(obj, objCache) {
  if (typeof obj === 'string') {
    obj = JSON.parse(obj);
  }
  if (typeof objCache === 'undefined') {
    objCache = [];
  }
  var idCount = obj.idCount;
  delete obj.idCount;
  objCache[idCount] = obj;

  for (var prop in obj) {
    if (typeof obj[prop] === 'object' && obj[prop] !== null) {
      exports.deserialize(obj[prop], objCache);
    }
    if (typeof obj[prop] === 'string') {
      if (obj[prop].indexOf(CIRCULAR) === 0) {
        var index = obj[prop].substring(9, obj[prop].length);
        obj[prop] = objCache[index];
      }
    }
  }
  return obj;
};
