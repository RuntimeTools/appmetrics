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
	env = monitoring.getEnvironment());
    for (var entry in env) {
		console.log(entry + ':' + env[entry]);
	};
});
monitoring.on('cpu', function (cpu) {
	console.log('[' + new Date(data.time) + ] CPU: ' + cpu.process');
});
```

### Connecting to the Health Center Eclipse IDE client
Connecting to the Health Center Eclipse IDE client requires the additional installation of a MQTT broker which the Node Application Metrics agent sends data to, and for the location to be configured via the `node_modules/appmetrics/appmetrics.properties` file. Installation and configuration documentation is available from the "[Health Center Knowledge Center][2]". 

Note that both the API and the Health Center Eclipse IDE can be used at the same time and will display the same data. This is done by requiring `appmetrics` into the application, which will cause the agent to try to connect to a MQTT broker, and not using the `node-hc` command line.



## API Documentation

### appmetrics.monitor()
Creates a Node Application Metrics agent client instance. This can subsequently be used to control data collection, request data, and subscribe to data events.

### appmetrics.emit(`type`, `data`)
Allows custom monitoring events to be added into the Node Application Metrics agent.
* `type` (String) the name you wish to use for the data. A subsequent event of that type will be raised, allowing callbacks to be registered for it.
* `data` (Object) the data to be made available with the event. The object must not contain circular references, and by convention should contain a `time` value representing the milliseconds when the event occurred.

### appmetrics.monitor.getEnvironment()
Requests an object containing all of the available environment information for the running application.

### appmetrics.monitor.enable(`type`)
Enable data generation of the specified data type.
* `type` (String) the type of event to start generating data for. Only 'profiling' is currently supported.

### appmetrics.monitor.disable(`type`)
Disable data generation of the specified data type.
* `type` (String) the type of event to stop generating data for. Only 'profiling' is currently supported.

### Event: 'cpu'
Emitted when a CPU monitoring sample is taken.
* `data` (Object) the data from the CPU sample:
    * `time` (Number) the milliseconds when the sample was taken. This can be converted to a Date using `new Date(cpu.time)`.
    * `process` (Number) the percentage of CPU used by the Node.js application itself. This is a value between 0.0 and 1.0.
    * `system` (Number) the percentage of CPU used by the system as a whole. This is a value between 0.0 and 1.0.

### Event: 'memory'
Emitted when a memory monitoring sample is taken.
* `data` (Object) the data from the memory sample:
    * `time` (Number) the milliseconds when the sample was taken. This can be converted to a Date using `new Date(cpu.time)`.
    * `physical_total` (Number) the total amount of RAM available on the system in bytes.
    * `physical_used` (Number) the total amount of RAM in use on the system in bytes.
    * `physical_free` (Number) the total amount of free RAM available on the system in bytes.
    * `virtual` (Number) the memory address space used by Node.js application in bytes.
    * `private` (Number) the amount of memory used by the Node.js application that cannot be shared with other processes, in bytes.
    * `physical` (Number) the amount of RAM used by the Node.js application in bytes.

### Event: 'gc'
Emitted when a garbage collection (GC) cycle occurs in the underlying V8 runtime.
* `data` (Object) the data from the GC sample:
    * `time` (Number) the milliseconds when the sample was taken. This can be converted to a Date using `new Date(cpu.time)`.
    * `type` (String) the type of GC cycle, either 'M' or 'S'.
    * `size` (Number) the size of the JavaScript heap in bytes.
    * `used` (Number) the amount of memory used on the JavaScript heap in bytes.
    * `duration` (Number) the duration of the GC cycle in milliseconds.

### Event: 'profiling'
Emitted when a profiling sample is available from the underlying V8 runtime.
* `data` (Object) the data from the profiling sample:
    * `time` (Number) the milliseconds when the sample was taken. This can be converted to a Date using `new Date(cpu.time)`.
    * `functions` (Array) an array of functions that ran during the sample. Each array entry consists of:
        * `self` (Number) the ID for this function.
        * `parent` (Number) the ID for this function's caller.
        * `name` (String) the name of this function.
        * `file` (String) the file in which this function is defined.
        * `line` (Number) the line number in the file.
        * `count` (Number) the number of samples for this function.

## License
This project is released under an Apache 2.0 open source license, however it has a dependency on a common agent from IBM Monitoring and Diagnostic Tools - Health Center, which has a proprietary IBM license.

## Version
1.0.0

[1]:https://marketplace.eclipse.org/content/ibm-monitoring-and-diagnostic-tools-health-center**
[2]:http://www-01.ibm.com/support/knowledgecenter/SS3KLZ/com.ibm.java.diagnostics.healthcenter.doc/topics/connecting.html