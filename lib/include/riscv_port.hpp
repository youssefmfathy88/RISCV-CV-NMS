#pragma once

// Single compatibility header. Under RISCV_BAREMETAL the C++ runtime is
// nexus-am's klib (printf, malloc, rand, assert, uptime). Otherwise the
// hosted C library is used. Every TU that needs I/O, allocation, or
// assertions should include this instead of the C headers directly.

#ifdef RISCV_BAREMETAL

#include <klib.h>

// Enable the RISC-V vector unit (MSTATUS_VS). nexus-am's _start only enables
// the FPU, so any auto-vectorized code faults unless this runs first. Call it
// as the first statement of main() in every bare-metal image. It is a no-op
// conceptually on the host build, where it is never called.
extern "C" void riscv_enable_vector();

#else

#include <cassert>
#include <cstdio>
#include <cstdlib>

#endif
