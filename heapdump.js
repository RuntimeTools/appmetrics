// Copyright (c) 2014, Ben Noordhuis <info@bnoordhuis.nl>
//
// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
//
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
// ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
// OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
'use strict';
var addon = require('./heapdump.node');

var kForkFlag = addon.kForkFlag;
var kSignalFlag = addon.kSignalFlag;

var flags = kSignalFlag;
var options = (process.env.NODE_HEAPDUMP_OPTIONS || '').split(/\s*,\s*/);
for (var i = 0, n = options.length; i < n; i += 1) {
  var option = options[i];
  if (option === '') continue;
  else if (option === 'fork') flags |= kForkFlag;
  else if (option === 'signal') flags |= kSignalFlag;
  else if (option === 'nofork') flags &= ~kForkFlag;
  else if (option === 'nosignal') flags &= ~kSignalFlag;
  else console.error('node-heapdump: unrecognized option:', option);
}
addon.configure(flags);

exports.writeSnapshot = function() {
  return addon.writeSnapshot.apply(null, arguments);
};
