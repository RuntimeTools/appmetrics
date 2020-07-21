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
#ifndef BUILDING_NODE_EXTENSION
#define BUILDING_NODE_EXTENSION
#endif

#include "node.h"
#include "v8.h"
#include "v8-profiler.h"
#include "nan.h"

using namespace v8;
//Only perform object tracking on node v0.11 +
#if NODE_VERSION_AT_LEAST(0, 11, 0)
/* Take a heap snapshot and convert it into a histogram giving the counts and sizes
 * of every type of object on the heap.
 */
NAN_METHOD(getObjectHistogram) {

	Isolate *isolate =  info.GetIsolate();
	if (isolate == NULL) {
		return;
	}

	HeapProfiler *heapProfiler = isolate->GetHeapProfiler();
	Local<Context> currentContext = isolate->GetCurrentContext();

#if NODE_VERSION_AT_LEAST(4, 0, 0) // > v4.00+
	// Title field removed in Node 4.x
#else
	Local<String> snapshotName = String::NewFromUtf8(isolate, "snapshot");
#endif

	/* TakeHeapSnapshot used to be called TakeSnapshot
	 * It's arguments changed so the latest versions don't need a title param.
	 */
#if NODE_VERSION_AT_LEAST(0, 11, 0) // > v0.11+
	const HeapSnapshot* snapshot = heapProfiler->TakeHeapSnapshot(
#else
	const HeapSnapshot* snapshot = heapProfiler->TakeSnapshot(snapshotName);
#endif
#if NODE_VERSION_AT_LEAST(4, 0, 0) // > v4.0+
	// Title field removed in Node 4.x
#else
	snapshotName
#endif
	);

	/* Build a simple histogram from the heap snapshot. */
	Local<Object> histogram = Object::New(isolate);
#if NODE_VERSION_AT_LEAST(13, 0, 0) // > v13.0+

	/* Declare our tuple keys outside the loop. */
	Local<String> countName = String::NewFromUtf8(isolate, "count").ToLocalChecked();
	Local<String> sizeName = String::NewFromUtf8(isolate, "size").ToLocalChecked();

	/* v8-profiler.h says that kObject is "A JS object (except for arrays and strings)."
	 * so we should include strings and arrays as objects in the histogram as they are
	 * objects as the user understands them.
	 * When you take a heap dump in Chrome dev tools and then view it the
	 * names "(string)" and "(array)" are used for these, so that's what we'll show the user.
	 */
	Local<String> stringName = String::NewFromUtf8(isolate, "(string)").ToLocalChecked();
	Local<String> arrayName = String::NewFromUtf8(isolate, "(array)").ToLocalChecked();
#else
	Local<String> countName = String::NewFromUtf8(isolate, "count");
	Local<String> sizeName = String::NewFromUtf8(isolate, "size");
	Local<String> stringName = String::NewFromUtf8(isolate, "(string)");
	Local<String> arrayName = String::NewFromUtf8(isolate, "(array)");
#endif

	/* Walk every node by index (not id) */
	for(int i = 0; i < snapshot->GetNodesCount(); i++ ) {

		const HeapGraphNode* node = snapshot->GetNode(i);

		Local<String> name;
		switch( node->GetType() ) {
		case HeapGraphNode::kObject:
			name = node->GetName();
			break;
		case HeapGraphNode::kString:
			name = stringName;
			break;
		case HeapGraphNode::kArray:
			name = arrayName;
			break;
		default:
			continue;
		}

		Local<Value> tupleval = Nan::Get(histogram, name).ToLocalChecked();
		Local<Object> tuple;

		int64_t ncount = 0;
		int64_t nsize = 0;
		if( !(tupleval->IsNull() || tupleval->IsUndefined()) ) {
			tuple = Nan::To<Object>(tupleval).ToLocalChecked();

			/* Nothing else can access the tuple or histogram objects,
			 * if we've found an entry for "name" then it will have these
			 * fields set. There's no need to check for null/undefined
			 * from Get.
			 */
			Local<Value> count = Nan::Get(tuple, countName).ToLocalChecked();
			ncount = count->IntegerValue(Nan::GetCurrentContext()).FromJust();
			Local<Value> size = Nan::Get(tuple, sizeName).ToLocalChecked();
			nsize = size->IntegerValue(Nan::GetCurrentContext()).FromJust();

		} else {
			/* Create a new tuple and add it to the histogram.
			 * Number objects are immutable so we have to replace
			 * existing values. There's no need to create initial
			 * values for count and size.
			 */
			tuple = Object::New(isolate);
#if NODE_VERSION_AT_LEAST(13, 0, 0) // > v13.0+
			histogram->Set(currentContext, name, tuple);
		}

		/* Update the values in the existing (or new) tuple */
		Local<Value> newcount = Number::New(isolate, ++ncount);
		tuple->Set(currentContext, countName, newcount);
		Local<Value> newsize = Number::New(isolate, nsize+node->GetShallowSize());
		tuple->Set(currentContext,sizeName, newsize);
#else
            histogram->Set(currentContext, name, tuple);
		}

		/* Update the values in the existing (or new) tuple */
		Local<Value> newcount = Number::New(isolate, ++ncount);
		tuple->Set(currentContext, countName, newcount);
		Local<Value> newsize = Number::New(isolate, nsize+node->GetShallowSize());
		tuple->Set(currentContext,sizeName, newsize);
#endif
	}

	// Delete the snapshot as soon as we are done with it.
	heapProfiler->DeleteAllHeapSnapshots();

	info.GetReturnValue().Set(histogram);

}
#endif