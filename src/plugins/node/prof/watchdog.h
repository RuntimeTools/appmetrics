/*******************************************************************************
 * Copyright 2014, Strongloop Inc.
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

#ifndef AGENT_SRC_WATCHDOG_H_
#define AGENT_SRC_WATCHDOG_H_

#include "compat.h"
#include "compat-inl.h"

#if defined(__linux__) && (defined(__i386) || defined(__x86_64__))

#include "util.h"

#include <dirent.h>
#include <errno.h>
#include <pthread.h>
#include <signal.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/syscall.h>
#include <sys/time.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

// V8's sampling profiler is implemented as a thread that sends SIGPROF signals
// to the main thread at a fixed rate, with the main thread's SIGPROF handler
// recording the call stack every time it receives a signal.  We selectively
// suspend the profiler thread and wake it up when an event loop stall is
// detected.
namespace watchdog {

namespace C = ::compat;

class Counter {
 public:
  explicit Counter(uint32_t value = 0) : value_(value) {}

  uint32_t Exchange(uint32_t value) {
    return __sync_lock_test_and_set(&value_, value);
  }

  uint32_t Increment() {
    return __sync_add_and_fetch(&value_, 1);
  }

 private:
  // Disallow copy and assign.
  void operator=(const Counter&);
  Counter(const Counter&);
  uint32_t value_;
};

// Caveat emptor: glibc uses the first two real-time signals for thread
// cancellation and applies some macro cleverness to adjust SIGRTMIN.
// That cleverness fails when you pick up SIGRTMIN from <asm-generic/signal.h>
// instead of <bits/signum.h> and that is why we use SIGRTMAX instead.
static const int kResumeSignal = SIGRTMAX - 1;
static const int kSuspendSignal = SIGRTMAX - 2;

static Counter watchdog_activation_count;
static __thread pid_t profiler_tid;
static itimerspec no_timeout;  // Non-const because non-default constructible.
static itimerspec timeout;
static timer_t timer_id;

inline pid_t FindProfilerTid() {
  DIR* dir = ::opendir("/proc/self/task");
  if (dir == NULL) {
    ::perror("opendir");
    return 0;
  }
  pid_t tid = 0;
  char path[1024];
  while (const dirent* const ent = ::readdir(dir)) {
    ::snprintf(path, sizeof(path), "/proc/self/task/%s/comm", ent->d_name);
    int fd = ::open(path, O_RDONLY);
    if (fd == -1) continue;
    char buf[256];
    ssize_t nread;
    do {
      nread = ::read(fd, buf, sizeof(buf));
    } while (nread == -1 && errno == EINTR);
    ::close(fd);
#if !NODE_VERSION_AT_LEAST(0, 11, 0)
    static const char name[] = "SignalSender\n";
#else
    static const char name[] = "v8:ProfEvntProc\n";
#endif
    const size_t size = sizeof(name) - 1;
    if (nread == static_cast<ssize_t>(size) && 0 == Compare(buf, name, size)) {
      tid = ::atoi(ent->d_name);
      break;
    }
  }
  ::closedir(dir);
  CHECK_GE(tid, 0);
  return tid;
}

inline long Syscall(long nr, long a, long b, long c,  // NOLINT(runtime/int)
                    long d, long e, long f) {         // NOLINT(runtime/int)
  const bool enabled = (nr == SYS_epoll_wait || nr == SYS_epoll_pwait) &&
                       profiler_tid > 0;
  if (enabled) {
    // About to sleep, suspend profiler thread and disarm timer.
    CHECK_EQ(0, ::syscall(SYS_tgkill, ::getpid(), profiler_tid,
                          kSuspendSignal));
    CHECK_EQ(0, ::timer_settime(timer_id, 0, &no_timeout, NULL));
  }
  long ret;  // NOLINT(runtime/int)
#if defined(__i386)
  __asm__ __volatile__(
      "push %%ebp;"
      "mov %7, %%ebp;"
      "int $0x80;"
      "pop %%ebp;"
      : "=a"(ret)
      : "a"(nr), "b"(a), "c"(b), "d"(c), "S"(d), "D"(e), "g"(f)
      : "memory");
#elif defined(__x86_64__)
  __asm__ __volatile__(
      "mov %5, %%r10;"
      "mov %6, %%r8;"
      "mov %7, %%r9;"
      "syscall;"
      : "=a"(ret)
      : "a"(nr), "D"(a), "S"(b), "d"(c), "g"(d), "g"(e), "g"(f)
      : "rcx", "r11", "r10", "r8", "r9", "memory");
#endif
  if (enabled) {
    // Waking up, rearm timer.
    CHECK_EQ(0, ::timer_settime(timer_id, 0, &timeout, NULL));
  }
  if (ret > -4096 && ret < 0) {
    errno = -ret;
    return -1;
  }
  return ret;
}

inline void PatchSyscall() {
  uint8_t* const address = reinterpret_cast<uint8_t*>(&syscall);
  const size_t page_size = ::getpagesize();
  uint8_t* const page_address = reinterpret_cast<uint8_t*>(
      reinterpret_cast<uintptr_t>(address) & ~(page_size - 1));
  sigset_t saved_set;
  // Temporarily block signals so we won't deadlock with
  // a signal handler while patching the syscall() wrapper.
  {
    sigset_t set;
    ::sigfillset(&set);
    CHECK_EQ(0, ::pthread_sigmask(SIG_SETMASK, &set, &saved_set));
  }
  // Temporarily lift the W^X protection.
  {
    const int protection = PROT_READ | PROT_WRITE | PROT_EXEC;
    CHECK_EQ(0, ::mprotect(page_address, page_size, protection));
  }
// Poke in JMP instructions that jump back to the start of the function.
// Suspends syscall() calls from other threads while we're patching the code.
#if defined(__i386)
  *reinterpret_cast<volatile uint32_t*>(address + 0) = 0xFCEBFEEB;
  *reinterpret_cast<volatile uint32_t*>(address + 4) = 0xF8EBFAEB;
#elif defined(__x86_64__)
  *reinterpret_cast<volatile uint64_t*>(address + 0) = 0xF8EBFAEBFCEBFEEBULL;
  *reinterpret_cast<volatile uint32_t*>(address + 8) = 0xF4EBF6EB;
#endif
  // Grace period to avoid racing with syscall() calls from other threads.
  // TODO(bnoordhuis) Capture threads with ptrace() instead?
  {
    struct timespec t = {0, 1000};
    ::nanosleep(&t, NULL);
  }
#if defined(__i386)
  // Poke in a "jmp <target>" diversion that calls our hook.  Note that the
  // jump address is relative to EIP + 5.  Update the first word last so
  // that other threads remain captured.
  {
    uint32_t target = reinterpret_cast<uint32_t>(&Syscall);
    target -= reinterpret_cast<uint32_t>(address);
    target -= 5;
    // Poke in the high 8 bits of the function address, followed by some nops.
    *reinterpret_cast<volatile uint32_t*>(address + 4) = (target >> 24);
    // Now poke in the JMP instruction and the low 24 bits.
    *reinterpret_cast<volatile uint32_t*>(address + 0) = (target << 8) | 0xE9;
  }
#elif defined(__x86_64__)
  // Poke in a "movabs <target>, %rax; jmp *%rax" diversion that calls our
  // hook.  Update the first word last so that other threads remain captured
  // until both instructions have been poked in.
  *reinterpret_cast<volatile uint64_t*>(address + 2) =
      reinterpret_cast<uint64_t>(&Syscall);
  *reinterpret_cast<volatile uint16_t*>(address + 10) = 0xE0FF;  // jmp *%rax
  *reinterpret_cast<volatile uint32_t*>(address + 0) =  // movabs $0, %rax
      0xB848 | (0xFFFF0000 & *reinterpret_cast<volatile uint32_t*>(address));
#endif
  CHECK_EQ(0, ::mprotect(page_address, page_size, PROT_READ | PROT_EXEC));
  CHECK_EQ(0, ::pthread_sigmask(SIG_SETMASK, &saved_set, NULL));
}

inline void OnSignal(int signo) {
  if (signo == kResumeSignal) return;
  CHECK_EQ(signo, kSuspendSignal);
  const int saved_errno = errno;
  ::sigset_t set;
  ::sigemptyset(&set);
  ::sigaddset(&set, kResumeSignal);
  ::sigaddset(&set, kSuspendSignal);
  do {
    signo = ::sigwaitinfo(&set, NULL);
  } while (signo == kSuspendSignal || (signo == -1 && errno == EINTR));
  watchdog_activation_count.Increment();
  CHECK_EQ(signo, kResumeSignal);
  errno = saved_errno;
}

const char* StartCpuProfiling(v8::Isolate* isolate, uint64_t timeout_in_ms) {
  // Also call StartCpuProfiling() when the profiler is already running,
  // it makes it collect another sample.
  if (timeout_in_ms == 0 || profiler_tid != 0) {
    C::CpuProfiler::StartCpuProfiling(isolate);  // Idempotent.
    return NULL;
  }
  sigset_t set;
  ::sigemptyset(&set);
  ::sigaddset(&set, SIGPROF);
  CHECK_EQ(0, ::pthread_sigmask(SIG_BLOCK, &set, NULL));
  watchdog_activation_count.Exchange(0);
  C::CpuProfiler::StartCpuProfiling(isolate);
  // Block again in case V8 adds a pthread_sigmask(SIG_UNBLOCK).
  CHECK_EQ(0, ::pthread_sigmask(SIG_BLOCK, &set, NULL));
  CHECK(profiler_tid = FindProfilerTid());
  CHECK_EQ(0, ::syscall(SYS_tgkill, ::getpid(), profiler_tid, kSuspendSignal));
  // Arm timer that unblocks the profiler thread on expiry.
  sigevent ev;
  // Can't use ev.sigev_notify_thread_id because of broken glibc headers.
  ev._sigev_un._tid = profiler_tid;
  ev.sigev_notify = SIGEV_THREAD_ID;
  ev.sigev_signo = kResumeSignal;
  CHECK_EQ(0, ::timer_create(CLOCK_MONOTONIC, &ev, &timer_id));
  CHECK_EQ(0, timeout.it_interval.tv_sec);
  CHECK_EQ(0, timeout.it_interval.tv_nsec);
  timeout.it_value.tv_sec = timeout_in_ms / 1000;
  timeout.it_value.tv_nsec = (timeout_in_ms % 1000) * 1000 * 1000;
  CHECK_EQ(0, ::timer_settime(timer_id, 0, &timeout, NULL));
  CHECK_EQ(0, ::pthread_sigmask(SIG_UNBLOCK, &set, NULL));
  return NULL;
}

const v8::CpuProfile* StopCpuProfiling(v8::Isolate* isolate) {
  if (profiler_tid > 0) {
    // Unblock profiler thread, V8 is about to pthread_join() it.
    CHECK_EQ(0, ::syscall(SYS_tgkill, ::getpid(), profiler_tid, kResumeSignal));
    CHECK_EQ(0, ::timer_settime(timer_id, 0, &no_timeout, NULL));
    CHECK_EQ(0, ::timer_delete(timer_id));
    profiler_tid = 0;
  }
  return C::CpuProfiler::StopCpuProfiling(isolate);
}

C::ReturnType WatchdogActivationCount(const C::ArgumentType& args) {
  C::ReturnableHandleScope handle_scope(args);
  return handle_scope.Return(watchdog_activation_count.Exchange(0));
}

void Initialize(v8::Isolate* isolate, v8::Local<v8::Object> binding) {
  sigset_t mask;
  ::sigemptyset(&mask);
  ::sigaddset(&mask, kResumeSignal);
  ::sigaddset(&mask, kSuspendSignal);
  struct sigaction act;
  ::memset(&act, 0, sizeof(act));
  act.sa_handler = OnSignal;
  act.sa_mask = mask;
  CHECK_EQ(0, ::sigaction(kResumeSignal, &act, NULL));
  CHECK_EQ(0, ::sigaction(kSuspendSignal, &act, NULL));
  // See https://github.com/joyent/libuv/issues/1317.  We need to know when
  // the program enters epoll_wait() but a bug in libuv makes prepare handles
  // unsuitable for that because they fire at the wrong time.  That leaves us
  // with little recourse but to hook the syscall() wrapper.
  PatchSyscall();

  v8::Local<v8::FunctionTemplate> watchdog_activation_count_template =
      C::FunctionTemplate::New(isolate, WatchdogActivationCount);
  binding->Set(
      C::String::NewFromUtf8(isolate, "watchdogActivationCount"),
      watchdog_activation_count_template->GetFunction());
}

}  // namespace watchdog

#else  // defined(__linux__) && (defined(__i386) || defined(__x86_64__))

namespace watchdog {

namespace C = ::compat;

void Initialize(v8::Isolate*, v8::Local<v8::Object>) {}

const char* StartCpuProfiling(v8::Isolate* isolate, uint64_t timeout) {
  if (timeout != 0) {
    return "watchdog profiling not supported on this platform";
  }
  C::CpuProfiler::StartCpuProfiling(isolate);
  return NULL;
}

const v8::CpuProfile* StopCpuProfiling(v8::Isolate* isolate) {
  return C::CpuProfiler::StopCpuProfiling(isolate);
}

}  // namespace watchdog

#endif  // defined(__linux__) && (defined(__i386) || defined(__x86_64__))

#endif  // AGENT_SRC_WATCHDOG_H_
