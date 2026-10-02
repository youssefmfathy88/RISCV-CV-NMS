#ifdef RISCV_BAREMETAL

// C++ runtime glue for the nexus-am bare-metal target.
//
// klib's cpp.c supplies only the __cxa_* guard/atexit stubs, not the
// allocation operators, so any use of new/delete would otherwise fail to
// link. These route C++ dynamic storage onto klib's malloc/free, which
// operate on the AM heap.

#include "riscv_port.hpp"

#include <cstddef>
#include <new>

void* operator new(std::size_t n) { return malloc(n); }
void* operator new[](std::size_t n) { return malloc(n); }

void operator delete(void* p) noexcept { free(p); }
void operator delete[](void* p) noexcept { free(p); }

// Sized deallocation (C++14) — the compiler emits these when it knows the
// object size at the delete point.
void operator delete(void* p, std::size_t) noexcept { free(p); }
void operator delete[](void* p, std::size_t) noexcept { free(p); }

// Called when a pure virtual function is invoked; there is no meaningful
// recovery on bare metal, so trap.
extern "C" void __cxa_pure_virtual()
{
    printf("FATAL: pure virtual function called\n");
    _halt(1);
}

// nexus-am's _start enables only the FPU (MSTATUS_FS), not the vector unit.
// GCC auto-vectorizes loops under -O2 with the RVV-enabled -march, emitting
// vsetvli/vid.v etc., which then trap with "Illegal instruction". Any
// bare-metal image must enable MSTATUS_VS before running vectorized code.
//
// The function is marked noinline and built without auto-vectorization so it
// can be called safely as the first statement of main() (or of the static-
// constructor runner) before any vectorized loop executes. This is the same
// idiom as nexus-am's apps/rvv-trigger.
extern "C" __attribute__((noinline, optimize("no-tree-vectorize")))
void riscv_enable_vector()
{
    uint64_t mstatus_vs = 0x200; // VS = Initial (bits [10:9] = 01)
    asm volatile("csrs mstatus, %0" ::"r"(mstatus_vs));
    asm volatile("csrwi vcsr, 0");
}

// nexus-am's runtime never runs C++ static constructors (its linker script
// and _start predate C++ support). gtest-lite relies on static init to
// self-register tests, so we run the .init_array handlers explicitly. The
// section boundaries come from the supplementary linker script
// cmake/riscv_init_array.ld, which appends .init_array to the image.
using CtorFunc = void (*)();
extern CtorFunc __init_array_start[];
extern CtorFunc __init_array_end[];

extern "C" void riscv_run_static_ctors()
{
    riscv_enable_vector();

    for (CtorFunc* f = __init_array_start; f != __init_array_end; ++f)
    {
        (*f)();
    }
}

#endif
