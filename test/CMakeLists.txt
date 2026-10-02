cmake_minimum_required(VERSION 3.22)

# Reference implementation library
add_subdirectory(reference)

# Host-side ONNX golden reference (Python, not cross-compiled)
add_subdirectory(GoldenReference)

# Unit tests
add_subdirectory(unit_test)
