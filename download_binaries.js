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

var OS = process.platform; // e.g. linux
var ARCH = process.arch; // e.g. ia32
var ENDIANNESS = process.config.variables.node_byteorder; // e.g. 'little'
var INSTALL_DIR = process.cwd();
var BASE_DOWNLOAD_URL = 'http://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/runtimes/tools/healthcenter/agents';
var AGENTCORE_PLATFORMS = ['aix-ppc',
                           'aix-ppc64',
                           'darwin-ia32',
                           'darwin-x64',
                           'linux-ia32',
                           'linux-ppc',
                           'linux-ppc64',
                           'linux-ppc64le',
                           'linux-s390',
                           'linux-s390x',
                           'linux-x64',
                           'win32-ia32',
                           'win32-x64'];
var AGENTCORE_VERSION = '3.0.6';

var LOG_FILE = path.join(INSTALL_DIR, 'install.log');
var logFileStream = fs.createWriteStream(LOG_FILE, {flags : 'a'});

console.log = function(info) { //
	logFileStream.write(util.format(info) + '\n');
	process.stdout.write(util.format(info) + '\n');
};

var showLegalWarning = function() {
	/* Legal warning */
	console.log(new Date().toUTCString());
	console.log('********************************************************************************');
	console.log('You are installing the Node Application Metrics monitoring and profiling module.');
	console.log('This package includes the IBM Monitoring and Diagnostic Tools - Health Center ');
	console.log('monitoring agent for Node.js, which is automatically downloaded as the module is');
	console.log('installed on your system/device. This is released under a proprietary IBM');
	console.log('licence. The license agreement for IBM Monitoring and Diagnostic Tools - Health');
	console.log('Center is available in the following location:');
	console.log('node_modules/appmetrics/licenses');
	console.log('Your use of the components of the package and dependencies constitutes your ');
	console.log('acceptance of this license agreement. If you do not accept the terms of the ');
	console.log('license agreement(s), delete the relevant component(s) immediately from your ');
	console.log('device.');
	console.log('********************************************************************************');
};

var getPlatform = function() {
	var platform;
	if (ARCH === 'ppc64' && ENDIANNESS === 'little') {
		platform = 'linux-ppc64le';
	} else {
		platform = OS + '-' + ARCH;
	}
	return platform;
};

var ensureSupportedPlatformOrExit = function() {
	/*
	 * Check up front for the platform-architectures for which there are
	 * available Health Center core agent downloads.
	 */
	var platform = getPlatform();
	if (AGENTCORE_PLATFORMS.indexOf(platform) === -1) {
		console.log(platform + ' is not a currently supported platform. Exiting');
		process.exit(1);
	}
};

var getAgentCorePlatformVersionDownloadURL = function() {
	return [BASE_DOWNLOAD_URL, 'core/tgz'].join('/') + 
	       ['/agentcore', AGENTCORE_VERSION, getPlatform()].join('-') + '.tgz';
};

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
showLegalWarning();
ensureSupportedPlatformOrExit();
downloadAndExtractTGZ(getAgentCorePlatformVersionDownloadURL(), '.');
