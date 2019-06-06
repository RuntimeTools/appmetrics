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
var Probe = require('../lib/probe.js');
var aspect = require('../lib/aspect.js');
var request = require('../lib/request.js');
var util = require('util');
var am = require('..');

function PostgresPromiseProbe() {
    Probe.call(this, 'pg-promise');
}
util.inherits(PostgresPromiseProbe, Probe);

PostgresPromiseProbe.prototype.attach = function (name, target) {
    var that = this;
    if (name != 'pg-promise') return target;

    if (target.__ddProbeAttached__) return target;
    target.__ddProbeAttached__ = true;
    /*
     * Patch the constructor so that we can patch io.sockets.emit() calls
     * to broadcast to clients. This also picks up calls to io.emit() as
     * they map down to io.socket.emit()
     */
    var newtarget = aspect.afterConstructor(target, {}, function (target, methodName, methodArgs, context, serverFun) {
        monitorQuery(serverFun, that);
        return serverFun;
    });
    /*
     * Remap the listen API to point to new constructor
     */
    /*
     * We patch the constructor every time, but only want to patch prototype
     * functions once otherwise we'll generate multiple events
     */
    if (!target.__prototypeProbeAttached__) {
        target.__prototypeProbeAttached__ = true;
    }
    return newtarget;
};

// This function monitors the query method given a connected
// client and the current 'PostgresProbe' reference
function monitorQuery(serverFun, that) {
    aspect.before(serverFun.pg.Client.prototype, 'query', function (target, methodName, methodArgs, probeData) {
        var method = 'query';
        that.metricsProbeStart(probeData, target, method, methodArgs);
        that.requestProbeStart(probeData, target, method, methodArgs);
        if (aspect.findCallbackArg(methodArgs) != undefined) {
            aspect.aroundCallback(methodArgs, probeData, function (target, args, probeData) {
                // Here, the query has executed and returned it's callback. Then
                // stop monitoring

                // Call the transaction link with a name and the callback for strong trace
                var callbackPosition = aspect.findCallbackArg(methodArgs);
                if (typeof callbackPosition != 'undefined') {
                    aspect.strongTraceTransactionLink('pg: ', method, methodArgs[callbackPosition]);
                }

                that.metricsProbeEnd(probeData, method, methodArgs);
                that.requestProbeEnd(probeData, method, methodArgs);
            });
        }
    });
}

/*
 * Lightweight metrics probe for Postgres queries
 *
 * These provide:
 *      time:       time event started
 *      query:      The SQL executed
 *      duration:   the time for the request to respond
 */
PostgresPromiseProbe.prototype.metricsEnd = function (probeData, method, methodArgs) {
    if (probeData && probeData.timer) {
        probeData.timer.stop();
        let method = methodArgs[0],
            table = methodArgs[0];
        if (methodArgs[0] && methodArgs[0].text) {
            method = methodArgs[0].text.split(" ")[0];
            table = methodArgs[0].text.match("/.*FROM (.*?) WHERE.*/i");
        }
        am.emit('postgres', {
            time: probeData.timer.startTimeMillis,
            query: methodArgs[0],
            duration: probeData.timer.timeDelta,
            method: table,
            table: table
        });
    }
};

/*
 * Heavyweight request probes for Postgres queries
 */
PostgresPromiseProbe.prototype.requestStart = function (probeData, target, method, methodArgs) {
    probeData.req = request.startRequest('postgres', 'query', false, probeData.timer);
    probeData.req.setContext({
        sql: methodArgs[0]
    });
};

PostgresPromiseProbe.prototype.requestEnd = function (probeData, method, methodArgs) {
    if (probeData && probeData.req) probeData.req.stop({
        sql: methodArgs[0]
    });
};

module.exports = PostgresPromiseProbe;