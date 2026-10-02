# NonMaxSuppression golden reference

Host-side ONNX golden cases for the student kernels. The C++ functions in
`ref::NonMaxSuppression` and `vec::NonMaxSuppression` start empty. These cases
are what a correct implementation must match.

## Setup

```bash
pip install -r test/GoldenReference/requirements.txt
```

## Prove the cases against ONNX Runtime

```bash
python -m pytest test/GoldenReference/test_nms_golden.py -q
```

or, after the RISC-V build is configured:

```bash
cmake --build build --target run_nms_golden
```

## C++ fixtures used by the RISC-V tests

```bash
python test/GoldenReference/generate_cpp_fixtures.py
```

This rewrites `test/unit_test/include/nms_onnx_cases.hpp` from `nms_cases.py`
(corners-only ONNX examples with `y1 <= y2` and `x1 <= x2`). Run it again only
after you change `nms_cases.py`.
