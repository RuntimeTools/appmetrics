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

#if NODE_VERSION_AT_LEAST(4, 0, 0) // > v0.11+
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
#if NODE_VERSION_AT_LEAST(4, 0, 0) // > v0.11+
	// Title field removed in Node 4.x
#else
	snapshotName
#endif
	);

	/* Build a simple histogram from the heap snapshot. */
	Local<Object> histogram = Object::New(isolate);

	/* Declare our tuple keys outside the loop. */
	Local<String> countName = String::NewFromUtf8(isolate, "count");
	Local<String> sizeName = String::NewFromUtf8(isolate, "size");

	/* v8-profiler.h says that kObject is "A JS object (except for arrays and strings)."
	 * so we should include strings and arrays as objects in the histogram as they are
	 * objects as the user understands them.
	 * When you take a heap dump in Chrome dev tools and then view it the
	 * names "(string)" and "(array)" are used for these, so that's what we'll show the user.
	 */
	Local<String> stringName = String::NewFromUtf8(isolate, "(string)");
	Local<String> arrayName = String::NewFromUtf8(isolate, "(array)");

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

		Local<Value> tupleval = histogram->Get(name);
		Local<Object> tuple;

		int64_t ncount = 0;
		int64_t nsize = 0;
		if( !(tupleval->IsNull() || tupleval->IsUndefined()) ) {
			tuple = tupleval->ToObject();

			/* Nothing else can access the tuple or histogram objects,
			 * if we've found an entry for "name" then it will have these
			 * fields set. There's no need to check for null/undefined
			 * from Get.
			 */
			Local<Value> count = tuple->Get(countName);
			ncount = count->IntegerValue();
			Local<Value> size = tuple->Get(sizeName);
			nsize = size->IntegerValue();

		} else {
			/* Create a new tuple and add it to the histogram.
			 * Number objects are immutable so we have to replace
			 * existing values. There's no need to create initial
			 * values for count and size.
			 */
			tuple = Object::New(isolate);
			histogram->Set(name, tuple);
		}

		/* Update the values in the existing (or new) tuple */
		Local<Value> newcount = Number::New(isolate, ++ncount);
		tuple->Set(countName, newcount);
		Local<Value> newsize = Number::New(isolate, nsize+node->GetShallowSize());
		tuple->Set(sizeName, newsize);

	}

	// Delete the snapshot as soon as we are done with it.
	heapProfiler->DeleteAllHeapSnapshots();

	info.GetReturnValue().Set(histogram);

}
#endif