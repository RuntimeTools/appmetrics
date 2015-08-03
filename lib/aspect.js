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

function aspect(type) {
	return function(target, meths, hook1, hook2) {
		if(!Array.isArray(meths)) {
			meths = [meths];
		}
		
		meths.forEach(function(methodName) {
			var existing = target[methodName];
			if(!existing) return;
 
			var hookBefore, hookAfter;
			if((type == 'before') && hook1) {
				hookBefore = hook1;
			} else if(type == "around" && hook1 && hook2) {
				hookBefore = hook1;
				hookAfter = hook2;
			} else if((type == 'after') && hook1) {
				hookAfter = hook1;
			}

			var newFunc;
			if(type == 'before') {
				newFunc = function() {
					hookBefore(this, arguments);
					return existing.apply(this, arguments);
				};
			}
			else if(type == "around") {
				newFunc = function() {
					hookBefore(this, arguments);
					var ret = existing.apply(this, arguments);
					if(process.version.split('.')[0] == 'v0' && process.version.split('.')[1] < 8){
						hookAfter(this, arguments, ret);
						return ret;
					}else{
						return hookAfter(this, arguments, ret);
					}
				};
			}
			else if(type == 'after') {
				newFunc = function() {
					var ret = existing.apply(this, arguments);
					if(process.version.split('.')[0] == 'v0' && process.version.split('.')[1] < 8){
						hookAfter(this, arguments, ret);
						return ret;
					} else {
						return hookAfter(this, arguments, ret);
					}
				};
			}
			newFunc.prototype = existing.prototype;

			target[methodName] = newFunc;
		});
	};
}

exports.aroundCallback = function(args, hookBefore, hookAfter) {
	var position = this.findCallbackArg(args);
	if(position == undefined) return;

	var orig = args[position];

	args[position] = function() {
		if(hookBefore) {
			hookBefore(this, arguments);
		}

		var ret = orig.apply(this, arguments);

		if(hookAfter) {
			hookAfter(this, arguments);
		}
		return ret;
	};
}

exports.findCallbackArg = function(args) {
	var position = undefined;
    for (var i = 0; i < args.length; i++) {
        if((typeof args[i] === 'function')) {
            position = i;
            break;
        }
    }
    return position;
}

exports.before = aspect("before");

exports.around = aspect("around");

exports.after = aspect("after");