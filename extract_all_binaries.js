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

var fs = require('fs');
var util = require('util');
var path = require('path');
var zlib = require('zlib');
var tar = require('tar');

var OS = process.platform; // e.g. linux
var ARCH = process.arch; // e.g. ia32
var ENDIANNESS = process.config.variables.node_byteorder; // e.g. 'little'
var INSTALL_DIR = process.cwd();
var AGENTCORE_PLATFORMS = [
  'aix-ppc',
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
  'win32-x64',
  'os390-s390x',
];
var AGENTCORE_VERSION = '3.2.6';
var APPMETRICS_VERSION = '3.1.3';

var LOG_FILE = path.join(INSTALL_DIR, 'install.log');
var logFileStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

console.log = function(info) {
  //
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
  var supportedMajorVersions = 'v4, v5, v6, v7, v8';
  // version strings are of the format 'vN.N.N' where N is a positive integer.
  // we want the first N.
  var majorVersion = process.version.substring(1, process.version.indexOf('.'));
  if (supportedMajorVersions.indexOf('v' + majorVersion) === -1) {
    console.log('Unsupported version ' + process.version + '. Trying rebuild.');
    fail();
  }
  return majorVersion;
};

var getAgentCorePlatformVersionDownloadURL = function() {
  return ['agentcore', AGENTCORE_VERSION, getPlatform()].join('-') + '.tgz';
};

var getAppMetricsPlatformVersionDownloadURL = function() {
  return [getSupportedNodeVersionOrExit() + '/appmetrics', APPMETRICS_VERSION, getPlatform()].join('-') + '.tgz';
};

var getWindowsRedisFiles = function() {
  return [getPlatform()].join('-') + '.tgz';
};

var downloadAndExtractTGZ = function(filepath, destDir, agentCoreFlag) {
  var readStreamTargetDir = 'binaries/appmetrics/tgz/';
  if (agentCoreFlag) {
    readStreamTargetDir = 'binaries/agentcore/tgz/';
  }
  if (fs.existsSync(readStreamTargetDir + filepath)) {
    zipAndExtract(readStreamTargetDir, filepath, destDir);
  } else {
    console.log(filepath + ' does not exist.');
    fail();
  }
};

function fail() {
  console.log('Falling back to node-gyp rebuild');
  process.exit(1);
}

function zipAndExtract(targetDir, relativeFilepath, destDir) {
  fs
    .createReadStream(targetDir + relativeFilepath)
    .pipe(zlib.createGunzip())
    .on('error', function(err) {
      console.log('ERROR: Failed to gunzip ' + relativeFilepath + ': ' + err.message);
      fail();
    })
    .pipe(tar.Extract({ path: destDir }))
    .on('error', function(err) {
      console.log('ERROR: Failed to untar ' + relativeFilepath + ': ' + err.message);
      fail();
    })
    .on('close', function() {
      console.log('Download and extract of ' + relativeFilepath + ' finished.');
    });
};

var installWinRedis = function(filepath, destDir) {
  zipAndExtract('binaries/winredis/', filepath, destDir);
};

/*
 * Start the download
 */
showLegalWarning();
ensureSupportedPlatformOrExit();
downloadAndExtractTGZ(getAgentCorePlatformVersionDownloadURL(), '.', true);
downloadAndExtractTGZ(getAppMetricsPlatformVersionDownloadURL(), '.', false);
if (OS === 'win32') {
  installWinRedis(getWindowsRedisFiles(), '.');
}
