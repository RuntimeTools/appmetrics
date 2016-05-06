2016-05-06, Version 1.0.10
==========================

 * Removed debug line (aaroncollins)

 * Fix for event data being transmitted incorrectly (#207) (aaroncollins)

 * Fix readme to update support info (#208) (Julie Stalley)

 * Add .gitignore so non-source is identified (Sam Roberts)

 * Bump version number to 1.0.10-dev.0 for development (Daniel Cunnington)


2016-04-27, Version appmetrics-1.0.9
====================================

 * Bump version number to 1.0.9 for release (Daniel Cunnington)

 * Fix recursive require of appmetrics (Sam Roberts)

 * agentcore.version to agent.version (Daniel Cunnington)

 * license back in AgentExtensions.h (Daniel Cunnington)

 * changes for agentcore 3.0.9 (Daniel Cunnington)

 * Bump version number to 1.0.9-dev.0 for development (Daniel Cunnington)

 * add http response data (T. Corbin)

 * Added loopback probe (aaroncollins)

 * riak probe (Daniel Cunnington)

 * Fixed error in previous fix (aaroncollins)

 * Fixed issue with instrumenting leveldown on multiple 'open' calls (aaroncollins)


2016-04-11, Version appmetrics-1.0.8
====================================

 * Bump version number to 1.0.8 for release (Daniel Cunnington)

 * Fix npm test failure on dev versions (Mike Tunnicliffe)

 * Fix crash on shutdown (Mike Tunnicliffe)

 * Move calls to uv_async_init so they occur on the main thread. (Howard Hellyer)

 * remove serialiser and just use JSON.stringify (T. Corbin)

 * Add extra null checks when creating a message and null out fields when freeing it to guard against double frees. (Howard Hellyer)

 * Update for #157 (Sian January)

 * Add support for Oracle database client #157 (Sian January)

 * Fix streaming downloads using request (Mike Tunnicliffe)

 * API tests added (ignasbol)

 * Bump version number to 1.0.8-dev.0 for development (mattcolegate)

 * Bump version number to 1.0.7 for release (mattcolegate)

 * Fix url in redis-probe.js (Howard Hellyer)

 * Fix url in redis-probe-test.js header (Howard Hellyer)

 * Updated index.js to publish data that can be visualised in Health Center (mattcolegate)

 * Use request instead of http to download binaries and licenses (Daniel Cunnington)

 * Implementation and readme changes for StrongOracle probe (also fixes a typo in README.md) (Sian January)

 * Bump version to 1.0.7-dev.0 for development (Daniel Cunnington)


2016-01-21, Version appmetrics-1.0.6
====================================

 * Bump version number to 1.0.6 for release (Daniel Cunnington)

 * added return to default case statement and refactored if statement in traceMethod (Daniel Cunnington)

 * called apply with this,arguments instead of null,arguments (Daniel Cunnington)

 * check for ret == undefined in index.js (Daniel Cunnington)

 * fix for config undefined (Daniel Cunnington)

 * bump version to 1.0.6-dev.0 for development (T. Corbin)

 * Update readme to add oracledb info #104 (Sian January)

 * Update readme to add oracledb info (Sian January)

 * Implement OracleDB probe #104 (Sian January)


2015-12-16, Version appmetrics-1.0.5
====================================

 * bump version to 1.0.5 for release (T. Corbin)

 * bump version to 1.0.5 (Toby Corbin)

 * Update README.md to version 1.0.5 (Toby Corbin)

 * Fix errors opening ghost setup page. (Howard Hellyer)

 * Map listen API to instrumented constructor (seabaylea)

 * Enable emitting of the http data as it can be visualised. (Howard Hellyer)

 * Bump version to 1.0.5-dev.0 for development (T. Corbin)


2015-12-08, Version appmetrics-1.0.4
====================================

 * Bump version to 1.0.4 for release (T. Corbin)

 * Update appmetrics version in download_licenses.js (T. Corbin)

 * Unref the latency intervals so node shuts down properly (T. Corbin)

 * Add missing return from callback. (Howard Hellyer)

 * issue #103 (T. Corbin)

 * Update README.md (Toby Corbin)

 * Change event name to 'socketio' (seabaylea)

 * Add support for event loop latency monitoring (seabaylea)

 * Update for v1.0.4 (seabaylea)

 * Added leveldown probe to monitor basic LevelDB operations (aaroncollins)

 * Carry out probe attached check centrally (seabaylea)

 * Add support for socket.io monitoring (seabaylea)

 * Add support for memcached monitoring (seabaylea)

 * Add ability to instrument after constructors (seabaylea)

 * Remove disabled code for inserting timing callbacks. (Howard Hellyer)

 * Remove arguments from redis event and request context (Howard Hellyer)

 * Implmenentation of appmetrics probe for the redis npm module. Provides monitoring for redis commands issued via the client api or via batch/multi objects. Test case verifies we get the expected number of events and that callbacks are still invoked. Update README.md to include a description of the redis probe. (Howard Hellyer)

 * Add max.heap.size to environment data (Mike Tunnicliffe)

 * Add max heap sizes to environment data for issue #53 (Mike Tunnicliffe)

 * Fix physical used garbage value issue #74 (Mike Tunnicliffe)

 * Change requestStart on mqlight probe to not mark all events as root (Sian January)

 * Add support for monitoring MQTT messaging (seabaylea)

 * Remove the call to set the context in requestStart for the mysql and mongo probes. The context is set in requestEnd and doesn't need to be set twice. This saves the cost of one of the JSON.stringify calls. I removed the one in requestStart as that was being done while the timer was running. The call in requestEnd occurs once the timer has stopped so won't be counted towards the request time. (Howard Hellyer)

 * Modified agent to pass a new appmetrics version (T. Corbin)

 * Make use of nan require resilient to failure (Mike Tunnicliffe)

 * Update build to resolve nan directory using require (Mike Tunnicliffe)

 * pass 'this'parameter to apply call (seabaylea)

 * Pass trace context as an object (seabaylea)

 * Postgres probe for monitoring PostgreSQL queries (Daniel Cunnington)

 * MQLight probe - initial code and readme (Sian January)

 * Global variables in probes can cause requests to be overwritten. Issue - #61 (Howard Hellyer)

 * Improve performance of HttpProbe.filterUrl() (seabaylea)

 * Remove millisecond duration value (seabaylea)

 * Remove checks for Node.ks version < 0.8 (seabaylea)

 * Ensure the external URL is used in HTTP events (seabaylea)

 * Expose patched method/function name in aspects API (seabaylea)

 * Disable stack traces on request events by default (seabaylea)

 * Fix newline (seabaylea)

 * Use process.hrtime() for durations (seabaylea)

 * Bump version to 1.0.4-dev.0 for development (Mike Tunnicliffe)


2015-11-03, Version appmetrics-1.0.3
====================================

 * Bump version to 1.0.3 (Mike Tunnicliffe)

 * More updates to README.md for 1.0.3 (Mike Tunnicliffe)

 * Update README.md for 1.0.3 (Mike Tunnicliffe)

 * Update appmetrics version in the license download script (Mike Tunnicliffe)

 * Bump appmetrics/agentcore versions in download scripts (Mike Tunnicliffe)

 * Fix line-endings (apg84)

 * Update NOTICES.html with the correct licenses+deleting irrelevant comments (apg84)

 * Use of copybuffer instead of newbuffer to avoid spurious memory access (glibc issue) (apg84)

 * Update syntax for nan 2.x, fix cleanup to match nan::newbuffer documentation (apg84)

 * Update syntax for nan 2.x (apg84)

 * Update nan level to 2.x (apg84)

 * Bump version to 1.0.3-dev.0 for development (Mike Tunnicliffe)


2015-09-04, Version appmetrics-1.0.2
====================================

 * Bump version to 1.0.2 for release (Mike Tunnicliffe)

 * Minor performance improvements (seabaylea)

 * Remove storage of API events in flight recorder (seabaylea)

 * Fix URL and missing word (seabaylea)

 * Remove redundant getRootModuleDir code (seabaylea)

 * Fix shallow link to wiki (seabaylea)

 * Fix markdown formatting issues (seabaylea)

 * Fix typo ("got" should be "go") (seabaylea)

 * Fix link to Eclipse Marketplace (seabaylea)

 * Update with new function for 1.0.2 (seabaylea)

 * Bump version to 1.0.2-dev.0 for development (Mike Tunnicliffe)

 * Pass by reference for internal events (seabaylea)

 * Trace functions added in constructors (seabaylea)

 * Reduce number of traced functions (seabaylea)

 * Use prototypal inheritance for probes (seabaylea)

 * Enable "dropin" probes (seabaylea)

 * Resolve ReferenceError in enable() calls (seabaylea)

 * Update README with new events and APIs (seabaylea)

 * Update the download script to allow Mac OS (Mike Tunnicliffe)

 * Update download script to work with new separated loader (Mike Tunnicliffe)

 * Open the appmetrics loader (Mike Tunnicliffe)

 * Change version to indicate this is not a release level (Mike Tunnicliffe)

 * Set appropriate versions on dependencies. (Mike Tunnicliffe)

 * Fix README layout on GitHub (seabaylea)

 * Support function trace generation (seabaylea)

 * Add support for MongoDB monitoring (seabaylea)

 * Add support for monitoring MySQL (seabaylea)

 * Add support for monitoring http (seabaylea)

 * Add missing serializer require statement (seabaylea)

 * Allow object graphs as event data (seabaylea)

 * Add aspect framework for monkey patching (seabaylea)

 * Add framework for tracking requests (seabaylea)


2015-08-27, Version appmetrics-1.0.1
====================================

 * Bump version to 1.0.1 (Mike Tunnicliffe)

 * Modify download scripts for agent core version 3.0.5 (Mike Tunnicliffe)

 * Fix crash on io.js v2.5 enabling profiling at run time (Mike Tunnicliffe)

 * README.md Documentation markdown formatting fixes (Mike Tunnicliffe)

 * README.md Documentation updates for 1.0.1 (Mike Tunnicliffe)

 * Add time to build id for consistency with prebuilt binaries (Mike Tunnicliffe)

 * Use .so for shared libraries on AIX from now on (Mike Tunnicliffe)

 * Explicit upfront OS/platform checking (Mike Tunnicliffe)

 * Update the download script to allow Mac OS (Mike Tunnicliffe)

 * Update download script to work with new separated loader (Mike Tunnicliffe)

 * Open the appmetrics loader (Mike Tunnicliffe)

 * Change version to indicate this is not a release level (Mike Tunnicliffe)

 * Set appropriate versions on dependencies. (Mike Tunnicliffe)

 * Fix level of Nan to 1.8.4 (tobespc)

 * Add MacOS support (Mike Tunnicliffe)

 * Update version to 1.0.1 to match the package (Chris Bailey)

 * Raise appmetrics version to 1.0.1 (Mike Tunnicliffe)

 * Set license field to Apache 2.0 and proprietary (Chris Bailey)

 * Fix syntax in same code (Chris Bailey)

 * Delete superfluous content from LICENSE file (Chris Bailey)

 * Add git repository to package.json (Chris Bailey)


2015-07-16, Version appmetrics-1.0.0
====================================

 * First release!
