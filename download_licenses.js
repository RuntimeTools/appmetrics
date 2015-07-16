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

var INSTALL_DIR = process.cwd();
var LICENSES_DIR = path.join(INSTALL_DIR, 'licenses');
var BASE_DOWNLOAD_URL = 'http://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/runtimes/tools/healthcenter/agents/nodejs/licenses';
var LICENSE_FILES = [ 'LA_cs',
                      'LA_de',
                      'LA_el',
                      'LA_en',
                      'LA_es',
                      'LA_fr',
                      'LA_in',
                      'LA_it',
                      'LA_ja',
                      'LA_ko',
                      'LA_lt',
                      'LA_pl',
                      'LA_pt',
                      'LA_ru',
                      'LA_sl',
                      'LA_tr',
                      'LA_zh',
                      'LA_zh_TW',
                      'LI_cs',
                      'LI_de',
                      'LI_el',
                      'LI_en',
                      'LI_es',
                      'LI_fr',
                      'LI_in',
                      'LI_it',
                      'LI_ja',
                      'LI_ko',
                      'LI_lt',
                      'LI_pl',
                      'LI_pt',
                      'LI_ru',
                      'LI_sl',
                      'LI_tr',
                      'LI_zh',
                      'LI_zh_TW',
                      'notices' ];

var LOG_FILE = path.join(LICENSES_DIR, 'licenses.log');

var downloadLicense = function(filename, sourcePathURL, destDir) {
	var downloadURL = [sourcePathURL, filename].join('/');

	/* Downloading the binaries */
	var file = fs.createWriteStream(path.join(destDir, filename));

	var req = http.get(downloadURL, function(response) {
		console.log('Downloading license from ' + downloadURL + ' to ' + path.join(destDir, filename));

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
fs.mkdir(LICENSES_DIR, function(err) { 
	// ignore err creating directory (eg if it already exists)
	var logFileStream = fs.createWriteStream(LOG_FILE, {flags : 'a'});
	console.log = function(info) { //
		logFileStream.write(util.format(info) + '\n');
		process.stdout.write(util.format(info) + '\n');
	};

	console.log(new Date().toUTCString());
	for (var i=0; i < LICENSE_FILES.length; i++) {
		downloadLicense(LICENSE_FILES[i], 
		                BASE_DOWNLOAD_URL,
		                LICENSES_DIR);
	}
});
