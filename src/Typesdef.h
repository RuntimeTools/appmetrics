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

#if defined(_WINDOWS)
	#include <basetsd.h>
	#include <limits.h>
#else
	#include <stdint.h>
	#include <limits.h>
	#include <inttypes.h>
#endif

#ifndef NULL
#define NULL 0
#endif

typedef signed int INT;
typedef unsigned int UINT;
typedef signed int INT32;
#ifndef UINT32
typedef unsigned int UINT32;
#endif
typedef unsigned int uint;
typedef signed int int32;
typedef unsigned int uint32;
typedef signed int int_t;
typedef unsigned int uint_t;

#if defined(_WINDOWS)
typedef signed int int32_t;
typedef unsigned int uint32_t;

typedef signed __int64 INT64;
typedef unsigned __int64 UINT64;

typedef signed __int64 int64;
typedef unsigned __int64 uint64;

typedef signed __int64 int64_t;
typedef unsigned __int64 uint64_t;

#define _P64        "I64"
#else
#if (__WORDSIZE == 64)
#define _P64         "l"
#else
#define _P64         "ll"
#endif

typedef int64_t INT64;
#ifndef UINT64
typedef uint64_t UINT64;
#endif

typedef int64_t int64;
typedef uint64_t uint64;

#endif
