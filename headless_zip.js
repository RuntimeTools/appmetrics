/*******************************************************************************
 * Copyright 2016 IBM Corp.
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
var path = require('path');
var JSZip = require('jszip');

var dirToWriteTo;
var filesToKeep = 10;
var filesWritten = [];

function deleteDir(directory) {
  // Delete temporary directory
  if (fs.existsSync(directory)) {
    fs.readdirSync(directory).forEach(function(file, index) {
      var fileName = path.join(directory, file);
      fs.unlinkSync(fileName);
    });
    fs.rmdirSync(directory);
  }
}

function deleteFile(filename) {
  fs.unlink(filename);
}

module.exports.setHeadlessOutputDir = function setHeadlessOutputDir(dir) {
  dirToWriteTo = dir;
};

module.exports.setFilesToKeep = function setFilesToKeep(numFiles) {
  filesToKeep = numFiles;
};

function timestamp() {
  var date = new Date(Date.now());
  var timestamp =
    pad(date.getDate().toString()) +
    pad((date.getMonth() + 1).toString()) +
    date.getFullYear().toString().substr(2, 3) +
    '_' +
    pad(date.getHours().toString()) +
    pad(date.getMinutes().toString()) +
    pad(date.getSeconds().toString()) +
    '_' +
    process.pid;
  return timestamp;
}

function pad(numberString) {
  // pads a single digit number with a leading 0
  if (numberString.length == 1) {
    return '0' + numberString;
  }
  return numberString;
}

module.exports.headlessZip = function headlessZip(dirToZip) {
  var outputFileName;
  if (dirToWriteTo) {
    outputFileName = path.join(dirToWriteTo, 'nodeappmetrics' + timestamp() + '.hcd');
  } else {
    outputFileName = 'nodeappmetrics' + timestamp() + '.hcd';
  }

  filesWritten.push(outputFileName);
  if (filesWritten.length > filesToKeep) {
    var earliest = filesWritten.shift();
    deleteFile(earliest);
  }

  if (fs.existsSync(dirToZip)) {
    var zip = new JSZip();
    var files = fs.readdirSync(dirToZip);
    for (var i = 0, len = files.length; i < len; i++) {
      zip.file(files[i], fs.readFileSync(path.join(dirToZip, files[i])), {
        compression: 'DEFLATE',
      });
    }
    fs.writeFileSync(outputFileName, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
    deleteDir(dirToZip);
  }
};

module.exports.tryZipOnExit = function tryZipOnExit() {
  var outputDir = dirToWriteTo || process.cwd();
  if (fs.existsSync(outputDir)) {
    var files = fs.readdirSync(outputDir);
    // Search for temporary output directory using pattern matching
    for (var i = 0, len = files.length; i < len; i++) {
      if (/tmp_(\w+)/.test(files[i].toString())) {
        var dirToZip = path.join(outputDir, files[i]);
        this.headlessZip(dirToZip);
        return;
      }
    }
  }
};
