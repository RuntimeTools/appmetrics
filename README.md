# Node Application Metrics
Node Application Metrics monitoring and profiling agent

Node Application Metrics instruments the Node.js runtime for performance monitoring, providing the monitoring data via an API. 
Additionally the data can be visualized in an Eclipse IDE using the "[IBM Monitoring and Diagnostics Tools - Health Center][1]" client.

See https://www.ibm.com/developerworks/java/jdk/tools/healthcenter/ for more details.

## Getting Started
### Prerequisites
The Node Application Metrics agent supports either the Node.js 0.10 or 0.12 runtime environments on the following platform architectures:

* 64-bit or 32-bit runtime on Windows (x64 or x86)
* 64-bit or 32-bit runtime on Linux (x64, x86, PPC32, PPC64, PPC64LE, z31, z64)
* 64-bit or 32-but runtime on AIX (PPC32, PPC64)

### Installation
Node Application Metrics can be installed using Node Package Manager (npm), which provides access to the data via the API and the Eclipse IDE:
```sh
$ npm install appmetrics
```
Node Application Metrics can also be installed globally, which additionally provides the `node-hc` command line. This requires no application modification but only makes the data available for use with the Health Center Eclipse IDE:
```sh
$ npm install -g appmetrics
$ node-hc app.js
```

## Running Node Application Metrics
### The Node Application Metrics API
In order the access the monitoring data via the API, the use of `appmetrics` needs to be added as the first line of your application:
```sh
var appmetrics = require('appmetrics');
```
and your application launched using the `node` command as usual. This starts the data collection agent, making data available via the API and additionally to the Heath Center Eclipse IDE.

To access the Node Application Metrics monitoring data, you need to use the `monitor()` API call:
```sh
var appmetrics = require('appmetrics');
var monitoring = appmetrics.monitor();
```
The monitoring instance can then be used to register callbacks and request information about the application:
```sh
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

### Connecting to the Health Center Eclipse IDE client
Connecting to the Health Center Eclipse IDE client requires the additional installation of a MQTT broker which the Node Application Metrics agent sends data to, and for the location to be configured via the `node_modules/appmetrics/appmetrics.properties` file. Installation and configuration documentation is available from the "[Health Center Knowledge Center][2]". 

Note that both the API and the Health Center Eclipse IDE can be used at the same time and will display the same data. This is done by requiring `appmetrics` into the application, which will cause the agent to try to connect to a MQTT broker, and not using the `node-hc` command line.



## API Documentation

### appmetrics.emit(`type`, `data`)
Allows custom monitoring events to be added into the Node Application Metrics agent.
* `type` (String) the name you wish to use for the data. A subsequent event of that type will be raised, allowing callbacks to be registered for it.
* `data` (Object) the data to be made available with the event. The object must not contain circular references, and by convention should contain a `time` value representing the milliseconds when the event occurred.

### appmetrics.enable(`type`, `config`)
Enable data generation of the specified data type with optional configuration.
* `type` (String) the type of event to start generating data for. Values of 'profiling', 'http', 'mongo', 'mysql', 'requests' and 'trace' are currently supported.
* `config` (Object) configuration to be added for the data type being enabled. See appmetrics.setConfig() for more information.

The following data types are disabled by default: `profiling`, `requests`, `trace`

### appmetrics.disable(`type`)
Disable data generation of the specified data type.
* `type` (String) the type of event to stop generating data for. Only 'profiling' is currently supported.

### appmetrics.setConfig(`type`, `config`)
Set the configuration to be applied to a specific data type. The configuration available is specific to the data type.
*   `type` (String) the type of event to apply the configuration to.
*   `config` (Object) key value pairs of configurations to be applied to the specified event. The available configuration options are as follows:


#####   'http':
*   `filters` (Array) an array of URL filter Objects consisting of:
    * `pattern` (String) a regular expression pattern to match HTTP method and URL against, eg. 'GET /favicon.ico$'
    * `to` (String) a conversion for the URL to allow grouping. A value of '' causes the URL to be ignored.
    
#####   'requests': 
*   `excludeModules` (Array) an array of String names for modules to exclude from request tracking.

#####   'trace: 
*   `includeModules` (Array) an array of String names for modules to include in function tracing. By default only non-module functions are traced when trace is enabled.

### appmetrics.monitor()
Creates a Node Application Metrics agent client instance. This can subsequently be used to get environment data and subscribe to data events.

### appmetrics.monitor.getEnvironment()
Requests an object containing all of the available environment information for the running application.

### Monitor Event: 'cpu'
Emitted when a CPU monitoring sample is taken.
* `data` (Object) the data from the CPU sample:
    * `time` (Number) the milliseconds when the sample was taken. This can be converted to a Date using `new Date(data.time)`.
    * `process` (Number) the percentage of CPU used by the Node.js application itself. This is a value between 0.0 and 1.0.
    * `system` (Number) the percentage of CPU used by the system as a whole. This is a value between 0.0 and 1.0.

### Monitor Event: 'memory'
Emitted when a memory monitoring sample is taken.
* `data` (Object) the data from the memory sample:
    * `time` (Number) the milliseconds when the sample was taken. This can be converted to a Date using `new Date(data.time)`.
    * `physical_total` (Number) the total amount of RAM available on the system in bytes.
    * `physical_used` (Number) the total amount of RAM in use on the system in bytes.
    * `physical_free` (Number) the total amount of free RAM available on the system in bytes.
    * `virtual` (Number) the memory address space used by Node.js application in bytes.
    * `private` (Number) the amount of memory used by the Node.js application that cannot be shared with other processes, in bytes.
    * `physical` (Number) the amount of RAM used by the Node.js application in bytes.

### Monitor Event: 'gc'
Emitted when a garbage collection (GC) cycle occurs in the underlying V8 runtime.
* `data` (Object) the data from the GC sample:
    * `time` (Number) the milliseconds when the sample was taken. This can be converted to a Date using `new Date(data.time)`.
    * `type` (String) the type of GC cycle, either 'M' or 'S'.
    * `size` (Number) the size of the JavaScript heap in bytes.
    * `used` (Number) the amount of memory used on the JavaScript heap in bytes.
    * `duration` (Number) the duration of the GC cycle in milliseconds.

### Monitor Event: 'profiling'
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

### Monitor Event: 'http'
Emitted when a HTTP request is made.
* `data` (Object) the data from the HTTP request:
    * `time` (Number) the milliseconds when the HTTP request was made. This can be converted to a Date using `new Date(data.time)`.
    * `method` (String) the HTTP method used for the request.
    * `url` (String) the URL on which the request was made.
    * `duration` (Number) the time taken for the HTTP request to be responded to in ms.

### Monitor Event: 'mysql'
Emitted when a MySQL query is made using the `mysql` module.
* `data` (Object) the data from the MySQL query:
    * `time` (Number) the milliseconds when the MySQL query was made. This can be converted to a Date using `new Date(data.time)`.
    * `query` (String) the query made of the MySQL database.
    * `duration` (Number) the time taken for the MySQL query to be responded to in ms.

### Monitor Event: 'mongo'
Emitted when a MongoDB query is made using the `mongodb` module.
* `data` (Object) the data from the MongoDB request:
    * `time` (Number) the milliseconds when the MongoDB query was made. This can be converted to a Date using `new Date(data.time)`.
    * `query` (String) the query made of the MongoDB database.
    * `duration` (Number) the time taken for the MongoDB query to be responded to in ms.

### Monitor Event: 'request'
Emitted when a request is made of the application that involves one or more monitored application level events. Request events are disabled by default.
* `data` (Object) the data from the request:
    * `time` (Number) the milliseconds when the request occurred. This can be converted to a Date using `new Date(data.time)`.
    * `type` (String) The type of the request event. This can currently be 'HTTP' or 'DB'
    * `name` (String) The name of the request event. This is the request task, eg. the url, or the method being used.
    * `request` (Object) the detailed data for the request event:
        * `type` (String) The type of the request event. This can currently be 'HTTP' or 'DB'
        * `name` (String) The name of the request event. This is the request task, eg. the url, or the method being used.
        * `context` (Object) A map of any addition context information for the request event.
        * `stack` (String) A stack trace for the event call.
        * `children` (Array) An array of child request events that occurred as part of the overall request event.
    * `duration` (Number) the time taken for the request to complete in ms.

## License
This project is released under an Apache 2.0 open source license, however it has a dependency on a common agent from IBM Monitoring and Diagnostic Tools - Health Center, which has a proprietary IBM license.

## Version
1.0.1

[1]:https://marketplace.eclipse.org/content/ibm-monitoring-and-diagnostic-tools-health-center**
[2]:http://www-01.ibm.com/support/knowledgecenter/SS3KLZ/com.ibm.java.diagnostics.healthcenter.doc/topics/connecting.html