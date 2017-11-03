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

var https = require('https');
var fs = require('fs');
var path = require('path');

const httpsOptions = {
  key: fs.readFileSync(path.resolve(__dirname, 'testkey.pem')),
  cert: fs.readFileSync(path.resolve(__dirname, 'testcert.crt')),
};

module.exports.server = https.createServer(httpsOptions, (req, res) => {
  // Send "Hello World" to every request
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello World');
});

this.server.listen(0);
