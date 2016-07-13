'use strict';

var util = require('util');

var MAX_SIZE = 10;

function TopFunctions() {
  this._data = null;
}

TopFunctions.prototype.poll = function() {
  var snapshot = this._data;
  this._data = null;
  return snapshot;
};

TopFunctions.prototype.add =
function add(collectionName, url, ms, tiers, graph) {
  var now = Date.now();
  var data = [now, url, ms, tiers, graph];
  var update = false;

  if (this._data == null) {
    this._data = {};
  }

  var list;
  if (this._data[collectionName]) {
    list = this._data[collectionName].list;
  } else {
    this._data[collectionName] = {
      start: Date.now(),
      collectionName: collectionName,
      list: []
    };
    list = this._data[collectionName].list;
  }

  // on the list
  var found = false;
  list.forEach(function(item) {
    if (item[1] == data[1]) {
      found = true;
      if (item[2] < data[2]) {
        util._extend(item, data);
        update = true;
      }
    }
  });

  // not on list
  if (!found) {
    // list has room
    if (list.length < MAX_SIZE) {
      list.push(data);
      update = true;
    } else {
      // it ranks on list (it's walltime is greater than the last item on the
      // list
      if (data[2] > last(list)[2]) {
        list.pop();
        list.push(data);
        update = true;
      }
    }
  }

  // we changed the content of the window, sort and emit time
  if (update) {
    list.sort(function(a, b) {
      if (a[2] < b[2]) return 1;
      if (a[2] == b[2]) return 0;
      if (a[2] > b[2]) return -1;
    });
  }
};

module.exports = new TopFunctions();

function last(l) {
  if (l.length > 0)
    return l[l.length-1];
  else
    return; // undefined
}
