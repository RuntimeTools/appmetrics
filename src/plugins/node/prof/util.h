/*******************************************************************************
 * Copyright 2014, StrongLoop Inc.
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

#ifndef AGENT_SRC_UTIL_H_
#define AGENT_SRC_UTIL_H_

#include <stddef.h>

#define STRINGIFY_HELPER(s) #s
#define STRINGIFY(s) STRINGIFY_HELPER(s)

#define CHECK_EQ(a, b) CHECK((a) == (b))
#define CHECK_GE(a, b) CHECK((a) >= (b))
#define CHECK_GT(a, b) CHECK((a) > (b))
#define CHECK_LE(a, b) CHECK((a) <= (b))
#define CHECK_LT(a, b) CHECK((a) < (b))
#define CHECK_NE(a, b) CHECK((a) != (b))

#define CHECK(expression)              \
  Check(expression, __FILE__ ":" STRINGIFY(__LINE__) ": " #expression)

template <typename T>
void Check(const T& result, const char* expression) {
  if (result == false) {
    ::fprintf(stderr, "CHECK failed: %s\n", expression);
    ::fflush(stderr);
    ::abort();
  }
}

template <typename T>
int Compare(const T* a, const T* b, size_t size) {
  return ::memcmp(a, b, size * sizeof(*a));  // NOLINT(runtime/memcmp)
}

#endif  // AGENT_SRC_UTIL_H_
