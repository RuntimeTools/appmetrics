# Node Application Metrics
Node Application Metrics monitoring and profiling agent

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/8caec03a401f4a37823ac547d7a0a272)](https://www.codacy.com/app/dancunnington/appmetrics?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=RuntimeTools/appmetrics&amp;utm_campaign=Badge_Grade)
[![Build Status](https://travis-ci.org/RuntimeTools/appmetrics.svg?branch=master)](https://travis-ci.org/RuntimeTools/appmetrics)
[![codebeat badge](https://codebeat.co/badges/9e9229c4-dcfa-4a98-a9a2-4770f3a2dd59)](https://codebeat.co/projects/github-com-runtimetools-appmetrics-master)
[![codecov.io](https://codecov.io/github/RuntimeTools/appmetrics/coverage.svg?branch=master)](https://codecov.io/github/RuntimeTools/appmetrics?branch=master)
![Apache 2](https://img.shields.io/badge/license-Apache2-blue.svg?style=flat)
[![Homepage](https://img.shields.io/badge/homepage-Node%20Application%20Metrics-blue.svg)](https://developer.ibm.com/node/monitoring-post-mortem/application-metrics-node-js/)

Node Application Metrics instruments the Node.js runtime for performance monitoring, providing the monitoring data via an API.
Additionally the data can be visualized by using the [Node Application Metrics Dashboard](https://github.com/RuntimeTools/appmetrics-dash).

The data can also be visualized in Eclipse using the [IBM Monitoring and Diagnostics Tools - Health Center][1] client. Profiling data is available in Health Center, but is not yet available in the Dashboard. See https://www.ibm.com/developerworks/java/jdk/tools/healthcenter/ for more details.

Node Application Metrics provides the following built-in data collection sources:

 Source             | Description
:-------------------|:-------------------------------------------
 Environment        | Machine and runtime environment information
 CPU                | Process and system CPU
 Memory             | Process and system memory usage
 GC                 | Node/V8 garbage collection statistics
 Event Loop         | Event loop latency information
 Loop               | Event loop timing metrics
 Function profiling | Node/V8 function profiling (disabled by default)
 HTTP               | HTTP request calls made of the application
 HTTP Outbound      | HTTP requests made by the application
 socket.io          | WebSocket data sent and received by the application
 LevelDB            | LevelDB queries made by the application
 MySQL              | MySQL queries made by the application
 MongoDB            | MongoDB queries made by the application
 PostgreSQL         | PostgreSQL queries made by the application
 MQTT               | MQTT messages sent and received by the application
 MQLight            | MQLight messages sent and received by the application
 Memcached          | Data that is stored or manipulated in Memcached
 OracleDB           | OracleDB queries made by the application
 Oracle             | Oracle queries made by the application
 StrongOracle       | StrongOracle database queries made by the application
 Redis              | Redis commands issued by the application
 Riak               | Riak methods called by the application
 Request tracking   | A tree of application requests, events and optionally trace (disabled by default)
 Function trace     | Tracing of application function calls that occur during a request (disabled by default)
## Performance overhead

Our testing has shown that the performance overhead in terms of processing is minimal, adding less than 0.5 % to the CPU usage of your application. The additional memory required is around 20 MB to gather information about your system and application.

We gathered this information by monitoring the sample application [Acme Air][3]. We used MongoDB as our datastore and used JMeter to drive load though the program.  We have performed this testing with Node.js version 6.10.3

## Getting Started

### Installation

You can get Node Application Metrics from 3 different places:

  * npmjs.org (install by running `npm install appmetrics`. Native libraries are prebuilt)
  * Github ([install from source](https://github.com/RuntimeTools/appmetrics/wiki/Install-direct-from-github-source) by cloning the git repository. Requires a compiler)
  * [IBM SDK for Node.js](https://developer.ibm.com/node/sdk/) (packaged with the SDK, native libraries are prebuilt)

Using **npm** you can install Node Application Metrics either locally or globally.

**When installed locally** you can access monitoring data via both the API and the Health Center client by modifying your application to use appmetrics (see *[Modifying your application to use the local installation](#modifying-your-application-to-use-the-local-installation)*).

To perform a local install:
```sh
$ npm install appmetrics
```
A local install will put the module inside "*`./node_modules` of the current package root*" (see the [npm documentation][4] for more information); usually this is the current directory and in that case the module installation directory will be `./node_modules/appmetrics`.

**When installed globally** you can access monitoring data via the Health Center client (but not the API) by using the `node-hc` command-line utility (see *[The `node-hc` command](#the-node-hc-command)*).

To perform a global install:
```sh
$ npm install -g appmetrics
```
A global install will put the module inside a directory tied to your Node.js SDK.

* On Windows, either:
  * `<UserDirectory>\AppData\Roaming\npm\node_modules`
  * or: `<NodeInstallDirectory>\node_modules`
* On other platforms:
  * `<node_install_directory>/lib/node_modules`

It also adds the `node-hc` command to another directory tied to your Node.js SDK, one that was added to your executable search path by the Node.js SDK installer.

* On Windows, either:
  * `<UserDirectory>\AppData\Roaming\npm`
  * or: `<NodeInstallDirectory>`
* On other platforms:
  * `<node_install_directory>/bin`

### Configuring Node Application Metrics

Node Application Metrics can be configured in two ways, by using the configuration file described below or via a call to configure(options).

Node Application Metrics comes with a configuration file inside the [module installation directory](#installation) (`.../node_modules/appmetrics/appmetrics.properties`). This can be used to configure connection options, logging and data source options.

Node Application Metrics will attempt to load `appmetrics.properties` from one of the following locations (in order):

1. the application directory
2. the current working directory
3. the appmetrics module installation directory

The default configuration has minimal logging enabled, will attempt to send data to a local MQTT server on the default port and has method profiling disabled.

Many of the options provide configuration of the Health Center core agent library and are documented in the Health Center documentation: [Health Center configuration properties](https://www-01.ibm.com/support/knowledgecenter/SS3KLZ/com.ibm.java.diagnostics.healthcenter.doc/topics/configproperties.html).

The following options are specific to appmetrics:

* `com.ibm.diagnostics.healthcenter.data.profiling=[off|on]`
  Specifies whether method profiling data will be captured. The default value is `off`.  This specifies the value at start-up; it can be enabled and disabled dynamically as the application runs, either by a monitoring client or the API.

## Running Node Application Metrics

### The `node-hc` command
If you [globally installed](#installation) this module with npm, you can use the `node-hc` command to run your application instead of the `node` command. This will run your application as it would normally under node (including any node options) but additionally load and start `appmetrics`.

```sh
$ node-hc app.js
```

The purpose of this mode of operation is to provide monitoring of the application without requiring any changes to the application code. The data is sent to the Health Center Eclipse IDE client.

### Modifying your application to use the local installation
If you [locally install](#installation) this module with npm then you will additionally have access to the monitoring data via the `appmetrics` API (see *[API Documentation](#api-documentation)*).

To load `appmetrics` and get the monitoring API object, add the following to the start-up code for your application:
```js
var appmetrics = require('appmetrics');
var monitoring = appmetrics.monitor();
```
The call to `appmetrics.monitor()` starts the data collection agent, making the data available via the API and to the Heath Center client via MQTT.

You should start your application using the `node` command as usual (**not** `node-hc`).

You must call `require('appmetrics');` *before* the require statements for any npm modules you want to monitor. Appmetrics must be initialized first so that it can instrument modules for monitoring as they are loaded. If this is a problem due to the structure of your application you can require the module on the node command line with -r to make sure it is pre-loaded:

`> node -r appmetrics myapp.js`

Once you have loaded appmetrics you can then use the monitoring object to register callbacks and request information about the application:
```js
monitoring.on('initialized', function (env) {
    env = monitoring.getEnvironment();
    for (var entry in env) {
        console.log(entry + ':' + env[entry]);
    };
});

monitoring.on('cpu', function (cpu) {
    console.log('[' + new Date(cpu.time) + '] CPU: ' + cpu.process);
});
```

## Health Center Eclipse IDE client
**_Not supported on z/OS_**
### Connecting to the client

Connecting to the Health Center client requires the additional installation of a MQTT broker. The Node Application Metrics agent sends data to the MQTT broker specified in the `appmetrics.properties` file or set via a call to configure(options). Installation and configuration documentation for the Health Center client is available from the [Health Center documentation in IBM Knowledge Center][2].

Note that both the API and the Health Center client can be used at the same time and will receive the same data. Use of the API requires a local install and application modification (see *[Modifying your application to use the local installation](#modifying-your-application-to-use-the-local-installation)*).

Further information regarding the use of the Health Center client with Node Application Metrics can be found on the [appmetrics wiki][3]: [Using Node Application Metrics with the Health Center client](https://github.com/RuntimeTools/appmetrics/wiki/Using-Node-Application-Metrics-with-the-Health-Center-client).

## API Documentation
### appmetrics.configure(options)
Sets various properties on the appmetrics monitoring agent. If the agent has already been started, this function does nothing.
* `options`(Object) key value pairs of properties and values to be set on the monitoring agent.

Property name        | Property value type      | Property description
:--------------------|:-------------------------|:-----------------------------
 `applicationID`     | `string`                 | Specifies a unique identifier for the mqtt connection             
 `mqtt`              | `string['off'\|'on']`    | Specifies whether the monitoring agent sends data to the mqtt broker. The default value is `'on'`
 `mqttHost`          | `string`                 | Specifies the host name of the mqtt broker
 `mqttPort`          | `string['[0-9]*']`       | Specifies the port number of the mqtt broker
 `profiling`         | `string['off'\|'on']`    | Specifies whether method profiling data will be captured. The default value is `'off'`


### appmetrics.start()
Starts the appmetrics monitoring agent. If the agent is already running this function does nothing.

### appmetrics.stop()
Stops the appmetrics monitoring agent. If the agent is not running this function does nothing.

### appmetrics.enable(`type`, `config`)
Enable data generation of the specified data type. Cannot be called until the agent has been started by calling `start()` or `monitor()`.
* `type` (String) the type of event to start generating data for. Values of `eventloop`, `profiling`, `http`, `http-outbound`, `mongo`, `socketio`, `mqlight`, `postgresql`, `mqtt`, `mysql`, `redis`, `riak`, `memcached`, `oracledb`, `oracle`, `strong-oracle`, `requests` and `trace` are currently supported. As `trace` is added to request data, both `requests` and `trace` must be enabled in order to receive trace data.
* `config` (Object) (optional) configuration map to be added for the data type being enabled. (see *[setConfig](#appmetricssetconfigtype-config)*) for more information.

The following data types are disabled by default: `profiling`, `requests`, `trace`

### appmetrics.disable(`type`)
Disable data generation of the specified data type. Cannot be called until the agent has been started by calling `start()` or `monitor()`.
* `type` (String) the type of event to stop generating data for. Values of `eventloop`, `profiling`, `http`, `mongo`, `socketio`, `mqlight`, `postgresql`, `mqtt`, `mysql`, `redis`, `riak`, `memcached`, `oracledb`, `oracle`, `strong-oracle`, `requests` and `trace` are currently supported.

### appmetrics.setConfig(`type`, `config`)
Set the configuration to be applied to a specific data type. The configuration available is specific to the data type.
* `type` (String) the type of event to apply the configuration to.
* `config` (Object) key value pairs of configurations to be applied to the specified event. The available configuration options are as follows:

 Type                | Configuration key        | Configuration Value
:--------------------|:-------------------------|:-----------------------------
 `http`              | `filters`                | (Array) of URL filter Objects consisting of:<ul><li>`pattern` (String) a regular expression pattern to match HTTP method and URL against, eg. 'GET /favicon.ico$'</li><li>`to` (String) a conversion for the URL to allow grouping. A value of `''` causes the URL to be ignored.</li></ul>
 `requests`          | `excludeModules`         | (Array) of String names of modules to exclude from request tracking.
 `trace`             | `includeModules`         | (Array) of String names for modules to include in function tracing. By default only non-module functions are traced when trace is enabled.
 `advancedProfiling` | `threshold`              | (Number) millisecond run time of an event loop cycle that will trigger profiling

### appmetrics.emit(`type`, `data`)
Allows custom monitoring events to be added into the Node Application Metrics agent.
* `type` (String) the name you wish to use for the data. A subsequent event of that type will be raised, allowing callbacks to be registered for it.
* `data` (Object) the data to be made available with the event. The object must not contain circular references, and by convention should contain a `time` value representing the milliseconds when the event occurred.

### appmetrics.writeSnapshot([filename],[callback])
**_Not supported on z/OS_**
Dumps the v8 heap via `heapdump`.
For more information, see https://github.com/bnoordhuis/node-heapdump/blob/master/README.md

### appmetrics.monitor()
Creates a Node Application Metrics agent client instance. This can subsequently be used to get environment data and subscribe to data events. This function will start the appmetrics monitoring agent if it is not already running.

### appmetrics.monitor.getEnvironment()
Requests an object containing all of the available environment information for the running application. This will not contain all possible environment information until an 'initialized' event has been received.

### Event: 'cpu'
Emitted when a CPU monitoring sample is taken.
* `data` (Object) the data from the CPU sample:
    * `time` (Number) the milliseconds when the sample was taken. This can be converted to a Date using `new Date(data.time)`.
    * `process` (Number) the percentage of CPU used by the Node.js application itself. This is a value between 0.0 and 1.0.
    * `system` (Number) the percentage of CPU used by the system as a whole. This is a value between 0.0 and 1.0.

### Event: 'eventloop'
Emitted every 5 seconds, summarising sample based information of the event loop latency
* `data` (Object) the data from the event loop sample:
    * `time` (Number) the milliseconds when the event was emitted. This can be converted to a Date using `new Date(data.time)`.
    * `latency.min` (Number) the shortest sampled latency, in milliseconds.
    * `latency.max` (Number) the longest sampled latency, in milliseconds.
    * `latency.avg` (Number) the average sampled latency, in milliseconds.

### Event: 'gc'
Emitted when a garbage collection (GC) cycle occurs in the underlying V8 runtime.
* `data` (Object) the data from the GC sample:
    * `time` (Number) the milliseconds when the sample was taken. This can be converted to a Date using `new Date(data.time)`.
    * `type` (String) the type of GC cycle, either:
      - `'M'`: MarkSweepCompact, aka "major"
      - `'S'`: Scavenge, aka "minor"
      - `'I'`: IncrementalMarking, aka "incremental" (only exists on node 5.x
        and greater)
      - '`W'`: ProcessWeakCallbacks, aka "weakcb" (only exists on node 5.x
        and greater)
    * `size` (Number) the size of the JavaScript heap in bytes.
    * `used` (Number) the amount of memory used on the JavaScript heap in bytes.
    * `duration` (Number) the duration of the GC cycle in milliseconds.

### Event: 'initialized'
Emitted when all possible environment variables have been collected. Use `appmetrics.monitor.getEnvironment()` to access the available environment variables.

### Event: 'loop'
Emitted every 5 seconds, summarising event tick information in time interval
* `data` (Object) the data from the event loop sample:
    * `count` (Number) the number of event loop ticks in the last interval.
    * `minimum` (Number) the shortest (i.e. fastest) tick in milliseconds.
    * `maximum` (Number) the longest (slowest) tick in milliseconds.
    * `average` (Number) the average tick time in milliseconds.
    * `cpu_user` (Number) the percentage of 1 CPU used by the event loop thread in user code the last interval. This is a value between 0.0 and 1.0.
    * `cpu_system` (Number) the percentage of 1 CPU used by the event loop thread in system code in the last interval. This is a value between 0.0 and 1.0.

### Event: 'memory'
Emitted when a memory monitoring sample is taken.
* `data` (Object) the data from the memory sample:
    * `time` (Number) the milliseconds when the sample was taken. This can be converted to a Date using `new Date(data.time)`.
    * `physical_total` (Number) the total amount of RAM available on the system in bytes.
    * `physical_used` (Number) the total amount of RAM in use on the system in bytes.
    * `physical_free` (Number) the total amount of free RAM available on the system in bytes.
    * `virtual` (Number) the memory address space used by the Node.js application in bytes.
    * `private` (Number) the amount of memory used by the Node.js application that cannot be shared with other processes, in bytes.
    * `physical` (Number) the amount of RAM used by the Node.js application in bytes.

### Event: 'profiling'
Emitted when a profiling sample is available from the underlying V8 runtime.
* `data` (Object) the data from the profiling sample:
    * `time` (Number) the milliseconds when the sample was taken. This can be converted to a Date using `new Date(data.time)`.
    * `functions` (Array) an array of functions that ran during the sample. Each array entry consists of:
        * `self` (Number) the ID for this function.
        * `parent` (Number) the ID for this function's caller.
        * `name` (String) the name of this function.
        * `file` (String) the file in which this function is defined.
        * `line` (Number) the line number in the file.
        * `count` (Number) the number of samples for this function.

## API: Dependency Events (probes)

### Event: 'http'/'https'
Emitted when a HTTP/HTTPS request is made of the application.
* `data` (Object) the data from the HTTP(S) request:
    * `time` (Number) the milliseconds when the request was made. This can be converted to a Date using `new Date(data.time)`.
    * `method` (String) the HTTP(S) method used for the request.
    * `url` (String) the URL on which the request was made.
    * `duration` (Number) the time taken for the HTTP(S) request to be responded to in ms.
    * `header` (String) the response header for the HTTP(S) request.
    * `contentType` (String) the content type of the HTTP(S) request.
    * `requestHeader` (Object) the request header for HTTP(S) request.

### Event: 'http-outbound'/'https-outbound'
Emitted when the application makes an outbound HTTP/HTTPS request.
* `data` (Object) the data from the HTTP(S) request:
    * `time` (Number) the milliseconds when the request was made. This can be converted to a Date using `new Date(data.time)`.
    * `method` (String) the HTTP(S) method used for the request.
    * `url` (String) the URL on which the request was made.
    * `contentType` (String) the HTTP(S) response content-type.
    * `statusCode` (String) the HTTP response status code.
    * `duration` (Number) the time taken for the HTTP(S) request to be responded to in ms.
    * 'requestHeaders' (Object) the HTTP(S) request headers.

### Event: 'leveldown'
Emitted when a LevelDB query is made using the `leveldown` module.
* `data` (Object) the data from the LevelDB query:
    * `time` (Number) the time in milliseconds when the LevelDB query was made. This can be converted to a Date using `new Date(data.time)`.
    * `method` (String) The leveldown method being used.
    * `key` (Object) The key being used for a call to `get`, `put` or `del` (Undefined for other methods)
    * `value` (Object) The value being added to the LevelDB database using the `put` method (Undefined for other methods)
    * `opCount` (Number) The number of operations carried out by a `batch` method (Undefined for other methods)
    * `duration` (Number) the time taken for the LevelDB query to be responded to in ms.

### Event: 'loopback-datasource-juggler'
Emitted when a function is called on the `loopback-datasource-juggler` module
* `data` (Object) the data from the loopback-datasource-juggler event:
    * `time` (Number) the time in milliseconds when the event occurred. This can be converted to a Date using `new Date(data.time)`
    * `method` (String) the function the juggler has executed
    * `duration` (Number) the time taken for the operation to complete.

### Event: 'memcached'
Emitted when a data is stored, retrieved or modified in Memcached using the `memcached` module.
* `data` (Object) the data from the memcached event:
    * `time` (Number) the milliseconds when the memcached event occurred. This can be converted to a Date using `new Date(data.time)`
    * `method` (String) the method used in the memcached client, eg `set`, `get`, `append`, `delete`, etc.
    * `key` (String) the key associated with the data.
    * `duration` (Number) the time taken for the operation on the memcached data to occur.

### Event: 'mongo'
Emitted when a MongoDB query is made using the `mongodb` module.
* `data` (Object) the data from the MongoDB request:
    * `time` (Number) the milliseconds when the MongoDB query was made. This can be converted to a Date using `new Date(data.time)`
    * `query` (String) the query made of the MongoDB database.
    * `duration` (Number) the time taken for the MongoDB query to be responded to in ms.
    * `method` (String) the executed method for the query, such as find, update.
    * `collection` (String) the MongoDB collection name.

### Event: 'mqlight'
Emitted when a MQLight message is sent or received.
* `data` (Object) the data from the MQLight event:
    * `time` (Number) the time in milliseconds when the MQLight event occurred. This can be converted to a Date using new Date(data.time).
    * `clientid` (String) the id of the client.
    * `data` (String) the data sent if a 'send' or 'message', undefined for other calls.  Truncated if longer than 25 characters.
    * `method` (String) the name of the call or event (will be one of 'send' or 'message').
    * `topic` (String) the topic on which a message is sent/received.
    * `qos` (Number) the QoS level for a 'send' call, undefined if not set.
    * `duration` (Number) the time taken in milliseconds.

### Event: 'mqtt'
Emitted when a MQTT message is sent or received.
* `data` (Object) the data from the MQTT event:
    * `time` (Number) the time in milliseconds when the MQTT event occurred. This can be converted to a Date using new Date(data.time).
    * `method` (String) the name of the call or event (will be one of 'publish' or 'message').
    * `topic` (String) the topic on which a message is published or received.
    * `qos` (Number) the QoS level for the message.
    * `duration` (Number) the time taken in milliseconds.

### Event: 'mysql'
Emitted when a MySQL query is made using the `mysql` module.
* `data` (Object) the data from the MySQL query:
    * `time` (Number) the milliseconds when the MySQL query was made. This can be converted to a Date using `new Date(data.time)`.
    * `query` (String) the query made of the MySQL database.
    * `duration` (Number) the time taken for the MySQL query to be responded to in ms.

### Event: 'oracle'
Emitted when a query is executed using the `oracle` module.
* `data` (Object) the data from the Oracle query:
    * `time` (Number) the milliseconds when the Oracle query was made. This can be converted to a Date using `new Date(data.time)`.
    * `query` (String) the query made of the Oracle database.
    * `duration` (Number) the time taken for the Oracle query to be responded to in ms.

### Event: 'oracledb'
Emitted when a query is executed using the `oracledb` module.
* `data` (Object) the data from the OracleDB query:
    * `time` (Number) the milliseconds when the OracleDB query was made. This can be converted to a Date using `new Date(data.time)`.
    * `query` (String) the query made of the OracleDB database.
    * `duration` (Number) the time taken for the OracleDB query to be responded to in ms.

### Event: 'postgres'
Emitted when a PostgreSQL query is made to the `pg` module.
* `data` (Object) the data from the PostgreSQL query:
    * `time` (Number) the milliseconds when the PostgreSQL query was made. This can be converted to a Date using `new Date(data.time)`.
    * `query` (String) the query made of the PostgreSQL database.
    * `duration` (Number) the time taken for the PostgreSQL query to be responded to in ms.

### Event: 'redis'
Emitted when a Redis command is sent.
* `data` (Object) the data from the Redis event:
    * `time` (Number) the time in milliseconds when the redis event occurred. This can be converted to a Date using new Date(data.time).
    * `cmd` (String) the Redis command sent to the server or 'batch.exec'/'multi.exec' for groups of command sent using batch/multi calls.
    * `duration` (Number) the time taken in milliseconds.

### Event: 'riak'
Emitted when a Riak method is called using the `basho-riak-client` module.
* `data` (Object) the data from the Riak event:
    * `time` (Number) the time in milliseconds when the riak event occurred. This can be converted to a Date using new Date(data.time).
    * `method` (String) the Riak method called.
    * `options` (Object) the options parameter passed to Riak.
    * `command` (Object) the command parameter used in the `execute` method.
    * `query` (String) the query parameter used in the `mapReduce` method.
    * `duration` (Number) the time taken in milliseconds.

### Event: 'socketio'
Emitted when WebSocket data is sent or received by the application using socketio.
* `data` (Object) the data from the socket.io request:
    * `time` (Number) the milliseconds when the event occurred. This can be converted to a Date using `new Date(data.time)`.
    * `method` (String) whether the event is a `broadcast` or `emit` from the application, or a `receive` from a client  .
    * `event` (String) the name used for the event.
    * `duration` (Number) the time taken for event to be sent or for a received event to be handled.

### Event: 'strong-oracle'
Emitted when a query is executed using the `strong-oracle` module.
* `data` (Object) the data from the Strong Oracle query:
    * `time` (Number) the milliseconds when the Strong Oracle query was made. This can be converted to a Date using `new Date(data.time)`.
    * `query` (String) the query made of the database.
    * `duration` (Number) the time taken for the Strong Oracle query to be responded to in ms.

## API: Requests

### Event: 'request'
Requests are a special type of event emitted by appmetrics.  All the probes named above can also create request events if requests are enabled.  Howver requests are nested within a root incoming request (usually http). Request events are disabled by default.
* `data` (Object) the data from the request:
    * `time` (Number) the milliseconds when the request occurred. This can be converted to a Date using `new Date(data.time)`.
    * `type` (String) The type of the request event. This is the name of the probe that sent the request data, e.g. `http`, `socketio` etc.
    * `name` (String) The name of the request event. This is the request task, eg. the url, or the method being used.
    * `request` (Object) the detailed data for the root request event:
        * `type` (String) The type of the request event. This is the name of the probe that sent the request data, e.g. `http`, `socketio` etc.
        * `name` (String) The name of the request event. This is the request task, eg. the url, or the method being used.
        * `context` (Object) Additional context data (usually contains the same data as the associated non-request metric event).
        * `stack` (String) An optional stack trace for the event call.
        * `children` (Array) An array of child request events that occurred as part of the overall request event. Child request events may include function trace entries, which will have a `type` of null.
        * `duration` (Number) the time taken for the request to complete in ms.
    * `duration` (Number) the time taken for the overall request to complete in ms.

### Supported platforms

The Node Application Metrics agent supports the following runtime environments where a Node.js runtime is available:

* **Node.js v4, v7 and v8** on:
  * 64-bit or 32-bit runtime on Windows (x64 or x86)
  * 64-bit or 32-bit runtime on Linux (x64, x86, PPC32, PPC64, PPC64LE, z31, z64)
  * 64-bit or 32-bit runtime on AIX (PPC64)
  * 64-bit runtime on Mac OS X (x64)
* **Node.js v6** on all the above, plus:
  * 64-bit runtime on z/OS (os390)

## Troubleshooting
Find below some possible problem scenarios and corresponding diagnostic steps. Updates to troubleshooting information will be made available on the [appmetrics wiki][3]: [Troubleshooting](https://github.com/RuntimeTools/appmetrics/wiki/Troubleshooting). If these resources do not help you resolve the issue, you can open an issue on the Node Application Metrics [appmetrics issue tracker][5].

### Checking Node Application Metrics has started
By default, a message similar to the following will be written to console output when Node Application Metrics starts:

`[Fri Aug 21 09:36:58 2015] com.ibm.diagnostics.healthcenter.loader INFO: Node Application Metrics 1.0.1-201508210934 (Agent Core 3.0.5.201508210934)`

### Error "Conflicting appmetrics module was already loaded by node-hc. Try running with node instead." when using `node-hc`
This error indicates you are using `node-hc` to run an application that uses the Node Application Metrics monitoring API (see *[Modifying your application to use the local installation](#modifying-your-application-to-use-the-local-installation)*). Resolve this by using `node` to run the application instead. **Alternatively**, you could remove (or disable temporarily) the use of the Node Application Metrics monitoring API in your application.

This error was added to prevent the scenario where 2 instances of the agent can be accidentally created and started in parallel -- the globally installed one created by `node-hc` and the locally installed one created by the `require('appmetrics');` call in an application modified to use the Node Application Metrics monitoring API.

### Error "The specified module could not be found ... appmetrics.node"
This error indicates there was a problem while loading the native part of the module or one of its dependent libraries. On Windows, `appmetrics.node` depends on a particular version of the C runtime library and if it cannot be found this error is the likely result.

Check:

* Does the `appmetrics.node` file exist in the indicated location? If not, try reinstalling the module.
* For version `1.0.0` on Windows: are `msvcr100.dll` and `msvcp100.dll` installed on your Windows system, and do they match the bitness (32-bit or 64-bit) of your Node.js runtime environment? If not, you may be able to install them with the *Visual C++ Redistributable Packages for Visual Studio 2010* package from the Microsoft website.
* For version `1.0.1` on Windows: does `msvcr120.dll` and `msvcp120.dll` exist in the module installation directory (see *[Installation](#install)*) and does it match the bitness of your Node.js runtime environment? If not, try reinstalling the module.

Note: On Windows, the global module installation directory might be shared between multiple Node.js runtime environments. This can cause problems with globally installed modules with native components, particularly if some of the Node.js runtime environments are 32-bit and others are 64-bit because the native components will only work with those with matching bitness.

### Error "Failed to open library .../libagentcore.so: /usr/lib64/libstdc++.so.6: version `GLIBCXX_3.4.15' not found"
This error indicates there was a problem while loading the native part of the module or one of its dependent libraries. On non-Windows platforms, `libagentcore.so` depends on a particular (minimum) version of the C runtime library and if it cannot be found this error is the result.

Check:

* Your system has the required version of `libstdc++` installed. You may need to install or update a package in your package manager. If your OS does not supply a package at this version, you may have to install standalone software - consult the documentation or support forums for your OS.
* If you have an appropriate version of `libstdc++`installed, ensure it is on the system library path, or use a method (such as setting `LD_LIBRARY_PATH` environment variable on Linux, or LIBPATH environment variable on AIX) to add the library to the search path.

### No profiling data present for Node.js applications
Method profiling data is not collected by default, check *[Configuring Node Application Metrics](#configuring-node-application-metrics)* for information on how to enable it.

If collection is enabled, an absence of method profiling data from a Node.js application could be caused by the type of tasks that are being run by your application -- it may be running long, synchronous tasks that prevent collection events from being scheduled on the event loop.

If a task uses the Node.js thread exclusively then shuts down the Node.js runtime environment, the Health Center agent may not get the opportunity to obtain *any* profiling data. An example of such an application is the Octane JavaScript benchmark suite, which loads the CPU continuously rather than dividing the load across multiple units of work.

## Source code
The source code for Node Application Metrics is available in the [appmetrics project][6]. Information on working with the source code -- installing from source, developing, contributing -- is available on the [appmetrics wiki][3].

## License
This project is released under an Apache 2.0 open source license.  

## Versioning scheme
The npm package for this project uses a semver-parsable X.0.Z version number for releases, where X is incremented for breaking changes to the public API described in this document and Z is incremented for bug fixes **and** for non-breaking changes to the public API that provide new function.

### Development versions
Non-release versions of this project (for example on github.com/RuntimeTools/appmetrics) will use semver-parsable X.0.Z-dev.B version numbers, where X.0.Z is the last release with Z incremented and B is an integer. For further information on the development process go to the  [appmetrics wiki][3]: [Developing](https://github.com/RuntimeTools/appmetrics/wiki/Developing).

## Version
3.1.3

## Release History
`3.1.3` - Packaging fix.  
`3.1.2` - Bug fixes.  
`3.1.1` - Node v6 on z/OS support.  
`3.1.0` - HTTPS probe added.  
`3.0.2` - Probe defect for Node 8 support.  
`3.0.1` - Packaging bug fix to allow build from source if binary not present.  
`3.0.0` - Remove express probe. Additional data available in http and request events. Code improvements.  
`2.0.1` - Remove support for Node.js 0.10, 0.12, 5.  Add heapdump api call.  
`1.2.0` - Add file data collection capability and option configuration via api.  
`1.1.2` - Update agent core to 3.0.10, support Node.js v7.  
`1.1.1` - Fix node-gyp rebuild failure and don't force MQTT broker to on  
`1.1.0` - Bug fixes, improved MongoDB data, updated dependencies, CPU watchdog feature  
`1.0.13` - Express probe, strong-supervisor integration  
`1.0.12` - Appmetrics now fully open sourced under Apache 2.0 license  
`1.0.11` - Bug fixes    
`1.0.10` - Bug fixes  
`1.0.9` - Loopback and Riak support, bug fixes and update to agent core 3.0.9.  
`1.0.8` - Oracle support, bug fixes and api tests runnable using 'npm test'.  
`1.0.7` - StrongOracle support, support for installing with a proxy, expose MongoDB, MQLight and MySQL events to connectors.  
`1.0.6` - OracleDB support and bug fixes.  
`1.0.5` - Expose HTTP events to connectors (including MQTT).  
`1.0.4` - Redis, Leveldown, Postgresql, Memcached, MQLight and MQTT support, higher precision timings, and improved performance.  
`1.0.3` - Node.js v4 support.  
`1.0.2` - HTTP, MySQL, MongoDB, request tracking and function tracing support.  
`1.0.1` - Mac OS X support, io.js v2 support.  
`1.0.0` - First release.

[1]:https://marketplace.eclipse.org/content/ibm-monitoring-and-diagnostic-tools-health-center
[2]:http://www.ibm.com/support/knowledgecenter/SS3KLZ/com.ibm.java.diagnostics.healthcenter.doc/topics/connecting.html
[3]:https://github.com/RuntimeTools/appmetrics/wiki
[4]:https://docs.npmjs.com/files/folders
[5]:https://github.com/RuntimeTools/appmetrics/issues
[6]:https://github.com/RuntimeTools/appmetrics
