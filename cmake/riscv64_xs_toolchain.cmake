# CMake toolchain file for the XiangShan (XS) RISC-V target.
#
# Cross-compiles with the GNU RISC-V toolchain for two image kinds:
#   - gem5 bare-metal ELFs linked against nexus-am's am/klib (freestanding
#     flags applied per-target via RISCV_BAREMETAL_COMPILE_FLAGS)
#   - qemu-riscv64 user-mode Linux static ELFs (hosted glibc, no freestanding)
#
# This file only configures the compiler and shared flags; the nexus-am
# archives, gem5 run integration, and qemu-user helpers live in
# cmake/riscv_add_baremetal.cmake and the top-level CMakeLists.txt.
#
# Usage:
#   cmake -S . -B build -DCMAKE_TOOLCHAIN_FILE=cmake/riscv64_xs_toolchain.cmake
#
# Tunables (all overridable with -D<VAR>=...):
#   RISCV_TOOLCHAIN_PREFIX  GNU triple prefix         (default riscv64-linux-gnu-)
#   RISCV_MARCH             -march                    (default rv64gcv + XiangShan crypto/bitmanip)
#   RISCV_MABI              -mabi                     (default lp64d)
#
# A toolchain file is re-read on every configure, so these are plain (non-
# cache) variables here; the top-level CMakeLists.txt re-declares them as
# cache entries with the same defaults so they show up in ccmake/cmake-gui.

# Resolve tunables from cache or environment, else defaults. Because a
# toolchain file runs before project(), we seed from the environment first.
if(NOT DEFINED RISCV_TOOLCHAIN_PREFIX)
  set(RISCV_TOOLCHAIN_PREFIX "riscv64-linux-gnu-")
endif()

if(NOT DEFINED RISCV_MARCH)
  # Matches nexus-am's apps/rvv-trigger and apps/tsvc: rv64gcv plus the
  # XiangShan bit-manip/crypto subsets. Keeping `v` present means later RVV
  # intrinsic work needs no flag change.
  set(RISCV_MARCH "rv64gcv_zba_zbb_zbc_zbs_zbkb_zbkc_zbkx_zknd_zkne_zknh_zkr_zksed_zksh_zkt")
endif()

if(NOT DEFINED RISCV_MABI)
  set(RISCV_MABI "lp64d")
endif()

# ---- target system ---------------------------------------------------------
set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR riscv64)

# Critical: CMake's compiler sanity check must not try to link a hosted
# executable (there is no libc start files / _start in the default link).
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)

# ---- compilers and binutils -------------------------------------------------
set(CMAKE_C_COMPILER   "${RISCV_TOOLCHAIN_PREFIX}gcc")
set(CMAKE_CXX_COMPILER "${RISCV_TOOLCHAIN_PREFIX}g++")
set(CMAKE_ASM_COMPILER "${RISCV_TOOLCHAIN_PREFIX}gcc")
set(CMAKE_OBJCOPY      "${RISCV_TOOLCHAIN_PREFIX}objcopy" CACHE FILEPATH "objcopy")
set(CMAKE_OBJDUMP      "${RISCV_TOOLCHAIN_PREFIX}objdump" CACHE FILEPATH "objdump")
set(CMAKE_AR           "${RISCV_TOOLCHAIN_PREFIX}ar"      CACHE FILEPATH "ar")

# ---- flags ------------------------------------------------------------------
#
# Shared flag set for both gem5 bare-metal and qemu-user Linux ELFs (validated
# end-to-end on gem5 with am/klib and on qemu-riscv64 with glibc).
#
#   -mcmodel=medany      position-independent-ish addressing within 2 GiB,
#                        required by nexus-am's riscv64.mk
#   -fno-pic -static     fully static link (bare-metal and qemu-user)
#   -fno-rtti/-fno-exceptions  klib has no RTTI/exception runtime
#   -fdata/-ffunction-sections   enable --gc-sections dead-code stripping
#
# Freestanding-only flags (-ffreestanding, -fno-builtin, etc.) live in
# RISCV_BAREMETAL_COMPILE_FLAGS (top-level CMakeLists.txt) and are applied
# per-target on bare-metal images and bare-metal libraries.
set(RISCV_COMMON_FLAGS
    "-march=${RISCV_MARCH} -mabi=${RISCV_MABI} -mcmodel=medany -fno-pic -static \
    -fdata-sections -ffunction-sections")

set(CMAKE_C_FLAGS_INIT   "${RISCV_COMMON_FLAGS}")
set(CMAKE_CXX_FLAGS_INIT "${RISCV_COMMON_FLAGS} -fno-rtti -fno-exceptions")

# nexus-am preprocessor defines live in the top-level CMakeLists.txt as
# RISCV_AM_DEFINE_FLAGS.

# Do not let CMake try to find host programs/libraries/headers in the target.
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)
