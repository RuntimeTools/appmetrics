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
var http = require('http');
var url = require('url');
var path = require('path');

var OS = process.platform; // e.g. linux
var ARCH = process.arch; // e.g. ia32
var ENDIANNESS = process.config.variables.node_byteorder; // e.g. 'little'
var INSTALL_DIR = process.cwd();
var PLUGINS_DIR = path.join(INSTALL_DIR, 'plugins');
var BASE_DOWNLOAD_URL = 'http://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/runtimes/tools/healthcenter/agents';
var AGENTCORE_PLATFORMS = ['aix-ppc',
                           'aix-ppc64',
                           'linux-ia32',
                           'linux-ppc',
                           'linux-ppc64',
                           'linux-ppc64le',
                           'linux-s390',
                           'linux-s390x',
                           'linux-x64',
                           'win32-ia32',
                           'win32-x64'];;
var AGENTCORE_VERSION = '3.0.5';
var AGENTCORE_LIBRARY_NAME = 'agentcore';
var AGENTCORE_PLUGIN_NAMES = ['hcmqtt',
                              'hcapiplugin',
                              'envplugin',
                              'cpuplugin',
                              'memoryplugin'];
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

var getLibraryFileName = function(name) {
	if (OS == 'win32') {
		return name + '.dll';
	}
	if (OS == 'aix') {
		return 'lib' + name + '.a';
	}
	return 'lib' + name + '.so';
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
	return [BASE_DOWNLOAD_URL, 'core/binaries', getPlatform(), AGENTCORE_VERSION].join('/');
};

var downloadBinary = function(filename, sourcePathURL, destDir) {
	var downloadURL = [sourcePathURL, filename].join('/');

	/* Downloading the binaries */
	var file = fs.createWriteStream(path.join(destDir, filename));

	var req = http.get(downloadURL, function(response) {
		console.log('Downloading binary from ' + downloadURL + ' to ' + path.join(destDir, filename));

		if (response.statusCode != 200) {
			console.log('ERROR: Unable to download ' + filename + ' from ' + downloadURL);
			process.exit(1);
		}

		response.pipe(file);

		file.on('finish', function() {
			console.log('Download of ' + filename + ' finished.');
			file.close();
		});
	}).on('error', function(e) {
		console.log('Got an error: ' + e.message);
		process.exit(1);
	});	
};


/*
 * Start the download
 */
showLegalWarning();
ensureSupportedPlatformOrExit();
fs.mkdir(PLUGINS_DIR, function(err) { 
	// ignore err creating directory (eg if it already exists)
	downloadBinary(getLibraryFileName(AGENTCORE_LIBRARY_NAME),
	               getAgentCorePlatformVersionDownloadURL(),
	               INSTALL_DIR);
	for (var i=0; i < AGENTCORE_PLUGIN_NAMES.length; i++) {
		downloadBinary(getLibraryFileName(AGENTCORE_PLUGIN_NAMES[i]),
		               getAgentCorePlatformVersionDownloadURL() + '/plugins',
		               PLUGINS_DIR);
	}
});
