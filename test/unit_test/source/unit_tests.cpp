// Shared main() for the aggregate unit_tests image and every per-test image.
//
// gtest-lite self-registers tests via C++ static constructors, which
// nexus-am's runtime never runs. riscv_run_static_ctors() (in the platform
// layer) enables the vector unit and runs the .init_array handlers, so it
// must be called before RUN_ALL_TESTS().

#include "gtest_lite.hpp"

#ifdef RISCV_BAREMETAL
extern "C" void riscv_run_static_ctors();
#endif

int main()
{
#ifdef RISCV_BAREMETAL
    riscv_run_static_ctors();
#endif
    return RUN_ALL_TESTS();
}
