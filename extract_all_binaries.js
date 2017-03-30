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
var url = require('url');
var path = require('path');
var zlib = require('zlib');
var tar = require('tar');

var OS = process.platform; // e.g. linux
var ARCH = process.arch; // e.g. ia32
var ENDIANNESS = process.config.variables.node_byteorder; // e.g. 'little'
var INSTALL_DIR = process.cwd();
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
var AGENTCORE_VERSION = "3.2.1";
var APPMETRICS_VERSION = "3.0.0";

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
    console.log('Licensed under the Apache License, Version 2.0 (the "License")');
    console.log('you may not use this file except in compliance with the License.');
    console.log('You may obtain a copy of the License at');
    console.log('');
    console.log('http://www.apache.org/licenses/LICENSE-2.0');
    console.log('');
    console.log('Unless required by applicable law or agreed to in writing, software');
    console.log('distributed under the License is distributed on an "AS IS" BASIS,');
    console.log('WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.');
    console.log('See the License for the specific language governing permissions and');
    console.log('limitations under the License.');	
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
	  fail();
	}
};

var getSupportedNodeVersionOrExit = function() {
	if (process.version.indexOf('v0.10') === 0) {
		return '0.10';
	}
	if (process.version.indexOf('v0.12') === 0) {
		return '0.12';
	}
	if (process.version.indexOf('v2') === 0) {
		return '2';
	}
	if (process.version.indexOf('v4') === 0) {
		return '4';
	}
	if (process.version.indexOf('v5') === 0) {
		return '5';
	}
	if (process.version.indexOf('v6') === 0) {
		return '6';
	}
	if (process.version.indexOf('v7') === 0) {
		return '7';
	}
	console.log('Unsupported version ' + process.version + '. Trying rebuild.');
  fail();
};

var getAgentCorePlatformVersionDownloadURL = function() {
	return ['agentcore', AGENTCORE_VERSION, getPlatform()].join('-') + '.tgz';
};

var getAppMetricsPlatformVersionDownloadURL = function() {
	return [getSupportedNodeVersionOrExit()+'/appmetrics', APPMETRICS_VERSION, getPlatform()].join('-') + '.tgz';
};

var getWindowsRedisFiles = function() {
	return [getPlatform()].join('-') + '.tgz';
};

var downloadAndExtractTGZ = function(filepath, destDir, agentCoreFlag) {
 	if (agentCoreFlag) {
    if(fs.existsSync('binaries/agentcore/tgz/'+filepath)) {
		  fs.createReadStream('binaries/agentcore/tgz/'+filepath).pipe(zlib.createGunzip()).on('error', function(err) {
			  console.log('ERROR: Failed to gunzip ' + filepath + ': ' + err.message);
        fail();
		  })
		  .pipe(tar.Extract({path: destDir})).on('error', function(err) {
			  console.log('ERROR: Failed to untar ' + filepath + ': ' + err.message);
        fail();
		  })
		  .on('close', function() {
			  console.log('Download and extract of ' + filepath + ' finished.');
		  });
    } else {
      console.log(filepath + " does not exist.")
      fail();
    }
	} else {
    if(fs.existsSync('binaries/appmetrics/tgz/'+filepath)) {
		  fs.createReadStream('binaries/appmetrics/tgz/'+filepath).pipe(zlib.createGunzip()).on('error', function(err) {
			  console.log('ERROR: Failed to gunzip ' + filepath + ': ' + err.message);
        fail();
		  })
		  .pipe(tar.Extract({path: destDir})).on('error', function(err) {
			  console.log('ERROR: Failed to untar ' + filepath + ': ' + err.message);
        fail();
		  })
		  .on('close', function() {
			  console.log('Download and extract of ' + filepath + ' finished.');
		  });
    } else {
      console.log(filepath + " does not exist.")
      fail();
    }
	}
	
};

function fail() {
  console.log('Falling back to node-gyp rebuild');
  process.exit(1);
}

var installWinRedis = function(filepath, destDir) {
	fs.createReadStream('binaries/winredis/'+filepath).pipe(zlib.createGunzip()).on('error', function(err) {
		console.log('ERROR: Failed to gunzip ' + filepath + ': ' + err.message);
		fail();
	})
	.pipe(tar.Extract({path: destDir})).on('error', function(err) {
		console.log('ERROR: Failed to untar ' + filepath + ': ' + err.message);
		fail();
	})
	.on('close', function() {
		console.log('Download and extract of ' + filepath + ' finished.');
	});
};

/*
 * Start the download
 */
showLegalWarning();
ensureSupportedPlatformOrExit();
downloadAndExtractTGZ(getAgentCorePlatformVersionDownloadURL(), '.', true);
downloadAndExtractTGZ(getAppMetricsPlatformVersionDownloadURL(), '.', false);
if(OS === 'win32') {
  installWinRedis(getWindowsRedisFiles(), '.');
}

