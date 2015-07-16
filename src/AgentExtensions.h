/*******************************************************************************
 * Copyright 2014, 2015 IBM Corp.
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

#ifndef ibmras_monitoring_monitoring_h
#define ibmras_monitoring_monitoring_h

#include <string>

#ifndef PLUGIN_API_VERSION
#define PLUGIN_API_VERSION "1.0"
#endif

#if defined(_WINDOWS)
#define PLUGIN_API_DECL __declspec(dllexport)	/* required for DLLs to export the plugin functions */
#else
#define PLUGIN_API_DECL
#endif




/*
 * API definitions for data sources to connect to the monitoring
 * agent.
 */

/* data from a source */
typedef struct monitordata {
	unsigned int provID;				/* provider ID, previously allocated during the source registration */
	unsigned int sourceID;			/* source ID, previously supplied by the source during registration */
	unsigned int size;				/* amount of data being provided */
	const char *data;			/* char array of the data to store */
	bool persistent;            /* persistent data will not be removed from the bucket */
} monitordata;

typedef monitordata* (*PULL_CALLBACK)(void);			/* shortcut definition for the pull source callback */
typedef void (*PULL_CALLBACK_COMPLETE)(monitordata*);	/* callback to indicate when the data source can free / re-use the memory */
typedef char* (*GET_CONFIG)(void);

/* common header for data sources */
typedef struct srcheader {
	unsigned int sourceID;			/* ID assigned by the provider - unique by provider */
	unsigned int capacity;			/* the amount of space in bytes that should be allocated for this source */
	const char *name;			/* null terminated C string */
	const char *description;	/* null terminated C string */
} srcheader;

typedef struct pushsource {
	srcheader header;			/* common source header */
	pushsource *next;			/* next source or null if this is the last one in the list */
} pushsource;


typedef struct pullsource{
	srcheader header;			/* common source header */
	pullsource *next;			/* the next source or null if this is the last one in the list */
	unsigned int pullInterval;		/* time in seconds at which data should be pulled from this source */
	PULL_CALLBACK callback;
	PULL_CALLBACK_COMPLETE complete;
} pullsource;

/* definition for connectors */
typedef void* (*CONNECTOR_FACTORY)(const char* properties);	/* short cut for the function pointer to invoke in the connector library */

/* definition for receivers */
typedef void (*RECEIVE_MESSAGE)(const char* id, unsigned int size, void *data);	/* short cut for the function pointer to invoke in the receiver library */


#if defined(_WINDOWS)
#if defined(EXPORT)
#define DECL __declspec(dllexport)	/* required for DLLs to export the plugin functions */
#else
#define DECL __declspec(dllimport)
#endif
#endif

/* provide a default definition of DECL of the platform does not define one */
#ifndef DECL
#define DECL
#endif

namespace ibmras {
namespace common {
namespace logging {
/*
 * Enumeration levels to set for the logger
 */
enum Level {
	/* log levels are ranked with debug being the most verbose */
	none, warning, info, fine, finest, debug
};
}
}
}




typedef void (*pushData)(monitordata *data);
typedef int (*sendMessage)(const char * sourceId, unsigned int size,void *data);
typedef void (*exposedLogger)(ibmras::common::logging::Level lev, const char * message);
typedef const char * (*agentProperty)(const char * key);
typedef void (*setAgentProp)(const char* key, const char* value);
typedef void (*lifeCycle)();
typedef bool (*loadPropFunc)(const char* filename);
typedef std::string (*getVer)();
typedef void (*setLogLvls)();

typedef struct agentCoreFunctions {
	pushData agentPushData;
	sendMessage agentSendMessage;
	exposedLogger logMessage;
	agentProperty getProperty;
} agentCoreFunctions;

typedef struct loaderCoreFunctions {
	lifeCycle init;
	lifeCycle start;
	lifeCycle stop;
	lifeCycle shutdown;
	exposedLogger logMessage;
	agentProperty getProperty;
	setAgentProp setProperty;
	loadPropFunc loadPropertiesFile;
    getVer getAgentVersion;
    setLogLvls setLogLevels; 

} loaderCoreFunctions;


typedef int (*PLUGIN_INITIALIZE)(const char* properties);
typedef pushsource* (*PUSH_SOURCE_REGISTER)(agentCoreFunctions aCF, unsigned int provID);
typedef void (*PUSH_CALLBACK)(monitordata* data);



namespace ibmras {
namespace monitoring {
namespace agent {

class DECL AgentLoader {
	static AgentLoader* getInstance();		/* return the singleton instance of the agent */
	virtual void init(){};							/* invoke to start the agent initialisation lifecycle event */
	virtual void start(){};							/* invoke to start the agent start lifecycle event */
	virtual void stop(){};							/* invoke to start the agent stop lifecycle event */
	virtual void shutdown(){};						/* invoke to shutdown the agent, it cannot be restarted after this */
	bool loadPropertiesFile(const std::string& filename);
											/* the location of the appmetrics.properties file to load */
};


}
}
} /* end namespace agent */


#endif /* ibmras_monitoring_monitoring_h */



