#!/usr/bin/env node

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
var node_args = process.execArgv;

// First argv[0] should be 'node' and argv[1] the name of this file.
// We want to IGNORE these 2 args
var args = process.argv.splice(0);
args.shift();
args.shift();

var arg = args.shift();
while (typeof arg != 'undefined') {
  if (arg == '-e') {
    var err = new Error('node-hc does not support -e');
    throw err;
  }
  if (arg.length > 0 && (arg.charAt(0) == '-' || arg == 'debug')) {
    node_args.push(arg);
    arg = args.shift();
  } else {
    args.unshift(arg);
    break;
  }
}

var path = require('path');
var launcher_dir = path.join(path.dirname(module.filename), '..');
var launcher_filename = path.join(launcher_dir, 'launcher.js');
var child_process = require('child_process');
if (process.env.NODE_PATH) {
  process.env.NODE_PATH = process.cwd() + path.delimiter + process.env.NODE_PATH;
} else {
  process.env.NODE_PATH = process.cwd();
}

var p = child_process.fork(launcher_filename, args, { execArgv: node_args });

p.on('close', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code);
  }
});
