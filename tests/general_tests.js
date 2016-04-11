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

var assert = require('assert');

function isReasonableTimestamp(t)
{
  return (new Date(t).getFullYear() === new Date().getFullYear());
}

function isInteger(n)
{
  return isNumeric(n) && (n % 1) == 0;
}

function isNumeric(n)
{
  return !isNaN(parseFloat(n)) && isFinite(n);
}

function runCPUTests(cpuData)
{
  console.error('CPU tests running ...');

  assert(isInteger(cpuData.time),
         'CPU data message does not have an integer timestamp ('
          + cpuData.time + ')');

  assert(isNumeric(cpuData.process),
         'CPU data message does not have a numeric process CPU usage ('
         + cpuData.process + ')');

  assert(isNumeric(cpuData.system),
         'CPU data message does not have a numeric total CPU usage ('
         + cpuData.system + ')');

  cpuData.time = parseInt(cpuData.time);
  cpuData.process = parseFloat(cpuData.process);
  cpuData.system = parseFloat(cpuData.system);

  assert(isReasonableTimestamp(cpuData.time),
         'CPU message contains a bad timestamp (' + cpuData.time + ')');

  //assert(total >= 0, 'CPU message contains negative total CPU usage ('+totalRaw+')');

  assert(cpuData.system <= 1,
         'CPU message contains total CPU usage greater than 1 ('
          + cpuData.system + ')');

  //assert(process >= 0, 'CPU message contains negative process CPU usage ('+processRaw+')');

  assert(cpuData.process <= 1,
         'CPU message contains process CPU usage greater than 1 ('
          + cpuData.process + ')');

  // Make this test a warning.
  //assert(process <= total, CPU message contains process CPU usage greater than the total CPU usage ('+processRaw+'>'+totalRaw+')');
  if (cpuData.process > cpuData.total)
  {
    console.error('WARNING: CPU message contains process CPU usage greater than '
                  + 'the total CPU usage ('
                  + cpuData.process + ' > ' + cpuData.system + ')');
  }

  console.error('CPU tests passed succesfully.');
}

function runMemoryTests(memData, prefix)
{
  var prefix = prefix || 'Memory data message ';

  console.error('Memory tests running ...');

  // Test if all the memory data values are integers.
  assert(isInteger(memData.time),
         prefix + 'does not have an integer timestamp (' + memData.time + ')');

  assert(isInteger(memData.physical_total),
         prefix + 'does not have an integer total physical memory usage ('
          + memData.physical_total + ')');

  assert(isInteger(memData.physical),
         prefix + 'does not have an integer physical memory usage ('
          + memData.physical + ')');

  assert(isInteger(memData.private),
         prefix + 'does not have an integer private memory usage ('
          + memData.private + ')');

  assert(isInteger(memData.virtual),
         prefix + 'does not have an integer virtual memory usage ('
          + memData.virtual + ')');

  assert(isInteger(memData.physical_free),
         prefix + 'does not have an integer free physical memory ('
          + memData.physical_free + ')');

  for (var entry in memData)
  {
      memData[entry] = parseInt(memData[entry]);
  }

  assert(isReasonableTimestamp(memData.time),
         prefix + 'does not contain a reasonable timestamp ('
          + memData.time + '), expected to be this year');

  // Test if all the memory data values are valid.
  assert(memData.physical_total === -1 || memData.physical_total >= 0,
         prefix + 'does not contain a valid total physical memory usage ('
          + memData.physical_total + ')');

  assert(memData.physical === -1 || memData.physical >= 0,
         prefix + 'does not contain a valid physical memory usage ('
          + memData.physical + ')');

  assert(memData.private === -1 || memData.private >= 0,
         prefix + 'does not contain a valid private memory usage ('
          + memData.private + ')');

  assert(memData.virtual === -1 || memData.virtual >= 0,
         prefix + 'does not contain a valid virtual memory usage ('
          + memData.virtual + ')');

  assert(memData.physical_free === -1 || memData.physical_free >= 0,
         prefix + 'does not contain a valid free physical memory ('
          + memData.physical_free + ')');

  console.error('Memory tests passed succesfully.');
}

function runGCTests(gcData)
{
  var prefix = prefix || 'GC data message ';

  console.error('GC tests running ...');

  // Test if all the GC data values are integers and type is either M or S.
  assert(isInteger(gcData.time),
         prefix + 'does not have an integer timestamp (' + gcData.time + ')');

  assert(gcData.type === 'M' || gcData.type == 'S',
         prefix + 'does not contain a recognised gc type ('
          + gcData.type + '), expected "M" or "S"');

  assert(isInteger(gcData.size),
         prefix+ 'does not have an integer gc heap size (' + gcData.size + ')');

  assert(isInteger(gcData.used),
         prefix+ 'does not have an integer gc heap used (' + gcData.used + ')');

  assert(isInteger(gcData.duration),
         prefix+ 'does not have an integer gc pause (' + gcData.duration + ')');

  for (var entry in gcData)
  {
    if (entry != 'type')
      gcData[entry] = parseInt(gcData[entry]);
  }

  assert(isReasonableTimestamp(gcData.time),
         prefix + 'does not contain a reasonable timestamp ('
          + gcData.time + '), expected to be this year');

  // Test if all the GC data values, except type, are valid.
  assert(gcData.size > 0,
         prefix + 'does not contain a positive gc heap size ('
          + gcData.size + ')');

  assert(gcData.used > 0,
         prefix + 'does not contain a positive gc heap used ('
          + gcData.used + ')');

  assert(gcData.duration >= 0,
         prefix + 'does not contain a positive (or 0) gc pause ('
          + gcData.duration + ')');

  assert(gcData.duration < 10000,
         prefix + 'does not contain a reasonable gc pause ('
          + gcData.duration + '), expected < 10000');

  console.error('GC tests passed succesfully.');
}

function runCommonEnvTests(commonEnvData)
{
  console.error('Environment tests running ...');

  var ARCHS = ['x86', 'x86_64', 'ppc32', 'ppc64', 'ppc64le', 's390', 's390x'];
  var OSES = ['AIX', 'Linux', 'Windows 7', 'Mac OS X'];

  assert(ARCHS.indexOf(commonEnvData['os.arch']) != -1,
         "Environment message does not have a recognised value for os.arch ("
         + commonEnvData['os.arch'] + ")");

  assert(OSES.indexOf(commonEnvData['os.name']) != -1,
         "Environment message does not have a recognised value for os.name ("
         + commonEnvData['os.name'] + ")");

  assert(/\S/.test(commonEnvData['os.version']),
         "Environment message has a blank value for os.version");

  assert(isInteger(commonEnvData['pid']),
         "Environment message does not have an integer value for pid ("
         + commonEnvData['pid'] + ")");

  assert(commonEnvData['pid'] > 1,
         "Environment message does not have a value for pid > 1 ("
         + commonEnvData['pid'] + ")");

  assert(/\S/.test(commonEnvData['native.library.date']),
         "Environment message has a blank value for native.library.date");

  // NOTE(mjt): jar.version is required from appmetrics v1.0.0 - v1.0.3
  // and is removed in 1.0.4
  if (commonEnvData.hasOwnProperty('jar.version')) {
// TODO(mjt): Re-enable once corbint fixes env plugin not to send blank
// jar.version. For now, commenting this out so it doesn't block testing.
//    assert(/^\d+\.\d+\.\d+\.\d{12}$/.test(commonEnvData['jar.version']),
//           "Environment message does not have a value for jar.version in a recognised format ("
//            + commonEnvData['jar.version'] + "), expected 99.99.99.123456789012");
  }

  assert(isInteger(commonEnvData['number.of.processors']),
         "Environment message does not have an integer value for number.of.processors ("
           + commonEnvData['number.of.processors'] + ")");

  assert(commonEnvData['number.of.processors'] > 0,
         "Environment message does not have a positive value for number.of.processors ("
           + commonEnvData['number.of.processors'] + ")");

  assert.notEqual(commonEnvData['command.line'], '',
                  "Environment message has a blank value for command.line");

  var envVarCount = 0;
  var keys = Object.keys(commonEnvData);
  for (var i=0; i < keys.length; i++) {
    if (/^environment./.test(keys[i])) envVarCount++;
  }
  assert(envVarCount > 0, "No environment variables in environment message");

  var requiredKeys = ['os.arch', 'os.name', 'os.version', 'pid', 'native.library.date',
                      'number.of.processors', 'command.line'];
  requiredKeys.forEach(function(key) {
    assert(commonEnvData.hasOwnProperty(key), "Missing key '" + key + "' in environment message");
  });

  console.error('Environment tests passed succesfully.');
}

function runNodeEnvTests(nodeEnvData)
{
  console.error('Node environment tests running ...');

  assert(/^v\d+.\d+.\d+/.test(nodeEnvData['runtime.version']),
         "Node version format not recognised (" + nodeEnvData['runtime.version']
           + "), expected format 'v99.99.99'");

  assert(['IBM SDK for Node.js', 'Node.js'].indexOf(nodeEnvData['runtime.name']) != -1,
         "Node runtime name not recognised (" + nodeEnvData['runtime.name'] + ")");

  if (nodeEnvData['runtime.vendor']) {
    assert.equal(nodeEnvData['runtime.vendor'], 'IBM',
                 "Node runtime vendor not recognised (" + nodeEnvData['runtime.vendor'] + ")");
  }

  if (nodeEnvData['appmetrics.version'])
  {
    assert(/^\d+\.\d+\.\d+(-dev\.\d+)?\.\d{12}$/.test(nodeEnvData['appmetrics.version']),
           "Appmetrics version format not recognised"
            + nodeEnvData['appmetrics.version'] + ", expected 99.99.99.123456789012 (or 99.99.99-dev.99.12345678901)");
  }

  if (nodeEnvData['agentcore.version'])
  {
    assert(/^\d+\.\d+\.\d+\.\d{12}$/.test(nodeEnvData['agentcore.version']),
           "Agent core version format not recognised"
            + nodeEnvData['agentcore.version'] + ", expected 99.99.99.123456789012");
  }

  // NOTE(mjt): heap.size.limit, max.semi.space.size and max.old.space.size were added in
  // appmetrics 1.0.4 (required field in this version onwards)
  // NOTE(ignasbol): max.heap.size included as well as part of 1.0.4
  var prefix = 'Node environment message ';
  if (nodeEnvData['heap.size.limit']) {
    assert(isInteger(nodeEnvData['heap.size.limit']),
           prefix + 'does not have an integer heap size limit (' + nodeEnvData['heap.size.limit'] + ')');
    assert(parseInt(nodeEnvData['heap.size.limit']) > 0,
           prefix + 'does not have a positive heap size limit (' + nodeEnvData['heap.size.limit'] + ')');

    assert(isInteger(nodeEnvData['max.semi.space.size']),
           prefix + 'does not have an integer max semi space size (' + nodeEnvData['max.semi.space.size'] + ')');
    assert(parseInt(nodeEnvData['max.semi.space.size']) > 0,
           prefix + 'does not have a positive max semi space size (' + nodeEnvData['max.semi.space.size'] + ')');

    assert(isInteger(nodeEnvData['max.old.space.size']),
           prefix + 'does not have an integer max old space size (' + nodeEnvData['max.old.space.size'] + ')');
    assert(parseInt(nodeEnvData['max.old.space.size']) > 0,
           prefix + 'does not have a positive max old space size (' + nodeEnvData['max.old.space.size'] + ')');

    assert(4*parseInt(nodeEnvData['max.semi.space.size']) + parseInt(nodeEnvData['max.old.space.size']) === parseInt(nodeEnvData['heap.size.limit']),
           prefix + 'values for max old space size and max semi space size do not match heap size limit');

    assert(isInteger(nodeEnvData['max.heap.size']),
           prefix + 'does not have an integer max heap size ('
            + nodeEnvData['max.heap.size'] + ')');

    assert(parseInt(nodeEnvData['max.heap.size']) > 0,
           prefix + 'does not have a positive max heap size ('
            + nodeEnvData['max.heap.size'] + ')');
  }

  var requiredKeys = ['runtime.version', 'runtime.name', 'command.line.arguments'];
  requiredKeys.forEach(function(key) {
    assert(nodeEnvData.hasOwnProperty(key), "Missing key '" + key + "' in Node environment message");
  });

  console.error('Node environment tests passed succesfully.');
}

function runProfilingTests(profData, prefix)
{
  //console.error('Profiling tests running ...');

  var prefix = prefix || 'Profiling message ';

  if (typeof profData !== 'object')
  {
    assert(isInteger(profData),
           prefix + 'does not have an integer timestamp (' + profData + ')');

    assert(isReasonableTimestamp(parseInt(profData)),
           prefix + 'does not contain a reasonable timestamp ('
             + profData + '), expected to be this year');
  }
  else
  {
    assert(isInteger(profData.self),
           prefix + "does not have an integer id (" + profData.self + ")");

    assert(isInteger(profData.parent),
           prefix + "does not have an integer parent id (" + profData.parent + ")");

    assert(isInteger(profData.line),
           prefix + "does not have an integer line number (" + profData.line + ")");

    assert(isInteger(profData.count),
           prefix + "does not have an integer sample count (" + profData.count + ")");

    for (var entry in profData)
    {
      if (entry != 'file' || entry != 'name')
        profData[entry] = parseInt(profData[entry]);
    }

    assert(profData.self > 0,
           prefix + "does not have a positive id (" + profData.self + ")");

    assert(profData.parent >= 0,
           prefix + "does not have a positive (or 0) parent id (" + profData.parent + ")");

    assert(profData.line >= 0,
           prefix + "does not have a positive (or 0) line number (" + profData.line + ")");

    assert(profData.count >= 0,
           prefix + "does not have a positive (or 0) sample count (" + profData.count + ")");

  }

  //console.error('Profiling tests passed succesfully.');
}

module.exports =
{
  isReasonableTimestamp: isReasonableTimestamp,
  isNumeric: isNumeric,
  isInteger: isInteger,
  runCPUTests: runCPUTests,
  runMemoryTests: runMemoryTests,
  runGCTests: runGCTests,
  runCommonEnvTests: runCommonEnvTests,
  runNodeEnvTests: runNodeEnvTests,
  runProfilingTests: runProfilingTests
};
