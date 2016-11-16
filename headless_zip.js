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

var fstream = require('fstream')
var tar = require('tar')
var zlib = require('zlib')
var fs = require('fs')
var path = require('path')

var dirToWriteTo;

function onError(err) {
	console.error('Headless Zip: an error occurred:', err)
}

function deleteDir(directory) {
	console.log('Deleting directory: ' + directory)
	// Delete temporary directory
	if(fs.existsSync(directory)) {
		fs.readdirSync(directory).forEach(function(file,index){
			var fileName = path.join(directory, file)
			fs.unlinkSync(fileName)
		})
		fs.rmdirSync(directory);
	}
}

module.exports.setHeadlessOutputDir = function setHeadlessOutputDir(dir) {
	dirToWriteTo = dir;
}

function timestamp() {
	var date = new Date(Date.now())
	var timestamp = pad(date.getDate().toString()) + pad(date.getMonth().toString()) + date.getFullYear().toString().substr(2,3) + '_'
		+ pad(date.getHours().toString()) + pad(date.getMinutes().toString()) + pad(date.getSeconds().toString()) + '_'
		+ process.pid
	return timestamp
}

function pad(numberString) {
	// pads a single digit number with a leading 0
	if(numberString.length == 1) {
		return '0' + numberString
	}
	return numberString
}

module.exports.headlessZip = function headlessZip(dirToZip) {
	var outputFileName;
	if(dirToWriteTo) {
		outputFileName = path.join(dirToWriteTo, 'nodeappmetrics' + timestamp() + '.hcd')
	} else {
		outputFileName = 'nodeappmetrics' + timestamp() + '.hcd'
	}
	console.log("zipping: " + dirToZip + " to file: " + outputFileName + "\n")

	var packer = tar.Pack({ fromBase: true })
		.on('error', onError)
	var zipper = zlib.Gzip()
	var writer = fstream.Writer({'path': outputFileName})
		.on('error', onError)
		.on('close', function() {
			deleteDir(dirToZip) 
		})

	fstream.Reader({'path': dirToZip, 'type': 'Directory'})
  		.on('error', onError)
		.pipe(packer)
		.pipe(zipper)
		.pipe(writer)
	
} 
