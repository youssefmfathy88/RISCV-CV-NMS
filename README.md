# NonMaxSuppression lab

Implement ONNX-style NonMaxSuppression twice, then prove both against the golden reference:

| Where | Namespace | What you write |
| --- | --- | --- |
| [`test/reference/source/NMS.cpp`](test/reference/source/NMS.cpp) | `ref::` | Scalar C++. No RVV. |
| [`lib/source/NMS.cpp`](lib/source/NMS.cpp) | `vec::` | Same algorithm with RISC-V Vector, through [`lib/include/riscv_wrappers.hpp`](lib/include/riscv_wrappers.hpp). |

Both functions are stubs that return `0`. The signatures and the written contract stay in the headers. Do not change the signatures.

The source of truth for correct output is the golden reference, not a finished kernel in this tree. There is no reference implementation to copy.

## What the function does

For each batch and each class:

1. Drop boxes whose score is **strictly below** `score_threshold` when that pointer is set. A null threshold keeps every box.
2. Order the remaining boxes by score, **highest first**. Equal scores keep their original box order (stable).
3. Greedily keep a box and suppress later boxes whose IoU is **strictly greater** than `iou_threshold`, until `max_output_boxes_per_class` boxes are kept for that class.

Write one selected row as `[batch, class, box_index]` into the caller-owned `selected_indices` buffer. Return how many rows you wrote.

Boxes are float32, shape `[num_batches, spatial_dim, 4]`, corner format `[y1, x1, y2, x2]` with `y1 <= y2` and `x1 <= x2`. Scores are float32, shape `[num_batches, num_classes, spatial_dim]`. `center_point_box` is always `CenterPointBox::Corners` (`0`). Empty inputs (`num_batches`, `num_classes`, or `spatial_dim` is 0, or `max_output_boxes_per_class <= 0`) return `0`.

Full comments are on `ref::NonMaxSuppression` and `vec::NonMaxSuppression` in:

- [`test/reference/include/NMS.hpp`](test/reference/include/NMS.hpp)
- [`lib/include/NMS.hpp`](lib/include/NMS.hpp)

`vec::` must call `rvv::` wrappers only. Do not include `<riscv_vector.h>` or call `__riscv_*` from the kernel.

## Golden reference

The cases are the educational subset of the official ONNX NonMaxSuppression-11 examples: corners only, ordered `y1 <= y2` and `x1 <= x2`. They live in [`test/GoldenReference/nms_cases.py`](test/GoldenReference/nms_cases.py). [`generate_cpp_fixtures.py`](test/GoldenReference/generate_cpp_fixtures.py) turns them into [`test/unit_test/include/nms_onnx_cases.hpp`](test/unit_test/include/nms_onnx_cases.hpp), which the RISC-V tests include.

On the host, prove the cases themselves against ONNX Runtime before you trust a failing C++ test:

```bash
pip install -r test/GoldenReference/requirements.txt
python -m pytest test/GoldenReference/test_nms_golden.py -q
```

Details: [`test/GoldenReference/README.md`](test/GoldenReference/README.md).

## Illustration

The interactive session is the walkthrough of the algorithm (score filter, odd-even sort, IoU, then the same stages with one RVV step at a time). Use it while you implement. It is not a drop-in copy of the C++ files.

```bash
cd illustration
npm install
npm run dev
```

Open [http://localhost:3000/nms](http://localhost:3000/nms). Routes are listed in [`illustration/README.md`](illustration/README.md).

## Build and check your work

Toolchain, nexus-am, and XS-GEM5 setup is in [`SETUP.md`](SETUP.md). After that:

```bash
cmake -S . -B build -DCMAKE_TOOLCHAIN_FILE=cmake/riscv64_xs_toolchain.cmake
cmake --build build -j8
```

Fast functional check (qemu-user):

```bash
cmake --build build --target run_NMS_test_qemu
```

Cycle-accurate check (gem5), once qemu is green:

```bash
cmake --build build --target run_NMS_test_gem5
```

`NMS_test` has three checks:

1. `ReferenceMatchesOnnxGolden` — your scalar code vs the ONNX fixtures.
2. `VectorizedMatchesOnnxGolden` — your vector code vs the same fixtures.
3. `VectorizedMatchesReference` (and the larger box-count case) — vector vs scalar. These pass only when both implementations agree, so finish the scalar kernel against the golden fixtures first.

A stub returns `0`, so the golden tests fail until you implement them. That failure is the starting point.

Regenerate the C++ fixtures only if you edit `nms_cases.py`:

```bash
python test/GoldenReference/generate_cpp_fixtures.py
```

## Suggested order

1. Read the header contract and run the illustration (`/nms`, then flow, IoU, sort, walkthrough).
2. Run the host pytest so you know the golden cases match ONNX.
3. Implement `ref::NonMaxSuppression` until `ReferenceMatchesOnnxGolden` passes under qemu.
4. Implement `vec::NonMaxSuppression` with the same results, using `rvv::` wrappers, until the vector golden test and the vector-vs-scalar tests pass.
5. Run the same binary on gem5 when you want cycle counts.
