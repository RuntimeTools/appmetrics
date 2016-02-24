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

var fs = require('fs');
var util = require('util');
var request = require('request');
var url = require('url');
var path = require('path');
var zlib = require('zlib');
var tar = require('tar');

var INSTALL_DIR = process.cwd();
var LICENSES_DIR = path.join(INSTALL_DIR, 'licenses');
var BASE_DOWNLOAD_URL = 'http://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/runtimes/tools/healthcenter/agents/nodejs/licenses-tgz';
var APPMETRICS_VERSION = '1.0.7'; /* TODO(tunniclm): Pick this up from the package.json */

var LOG_FILE = path.join(LICENSES_DIR, 'licenses.log');

var downloadAndExtractTGZ = function(downloadURL, destDir) {
	request(downloadURL)
	.on('response', function(response) {
		if (response.statusCode != 200) {
			console.log('ERROR: Failed to download ' + downloadURL + ': HTTP ' + response.statusCode);
			process.exit(1);
		}
	})
        .on('error', function(err) {
		console.log('ERROR: Failed to download ' + downloadURL + ': ' + err.message);
		process.exit(1);
	})
	.pipe(zlib.createGunzip()).on('error', function(err) {
		console.log('ERROR: Failed to gunzip ' + downloadURL + ': ' + err.message);
		process.exit(1);
	})
	.pipe(tar.Extract({path: destDir})).on('error', function(err) {
		console.log('ERROR: Failed to untar ' + downloadURL + ': ' + err.message);
		process.exit(1);
	})
	.on('close', function() {
		console.log('Download and extract of ' + downloadURL + ' finished.');
	});
};

/*
 * Start the download
 */

fs.mkdir(LICENSES_DIR, function(err) { 
	// ignore err creating directory (eg if it already exists)
	var logFileStream = fs.createWriteStream(LOG_FILE, {flags : 'a'});
	console.log = function(info) { //
		logFileStream.write(util.format(info) + '\n');
		process.stdout.write(util.format(info) + '\n');
	};

	console.log(new Date().toUTCString());
	var licenseFilename = ['appmetrics', APPMETRICS_VERSION, 'licenses.tgz'].join('-');
	downloadAndExtractTGZ([BASE_DOWNLOAD_URL, licenseFilename].join('/'), '.');
});
