#pragma once

// gtest-lite assertion helpers for image comparisons. Shared non-test
// utilities (FillDeterministic, CheckCorrectness, RandomInt) live in the
// library's riscv_utils.hpp.

#include "gtest_lite.hpp"
#include "riscv_utils.hpp"

#include <cstdint>

template <typename T>
void ExpectImagesEqual(const Image<T>& expected, const Image<T>& actual)
{
    EXPECT_TRUE(CheckCorrectness(expected, actual));
}

inline bool CheckSelectedIndicesEqual(const int64_t* expected, const int64_t* actual,
                                      int expected_count, int actual_count)
{
    bool is_correct = expected_count == actual_count;
    if (!is_correct)
    {
        printf("Selected index count mismatch: expected = %d, actual = %d\n",
               expected_count, actual_count);
    }

    const int count = expected_count < actual_count ? expected_count : actual_count;
    int mismatches = 0;
    for (int row = 0; row < count; row++)
    {
        for (int col = 0; col < 3; col++)
        {
            const int64_t expected_value = expected[row * 3 + col];
            const int64_t actual_value = actual[row * 3 + col];
            if (expected_value != actual_value)
            {
                is_correct = false;
                if (mismatches < 8)
                {
                    printf("Mismatch at (%d, %d): expected = %lld, actual = %lld\n",
                           row, col,
                           static_cast<long long>(expected_value),
                           static_cast<long long>(actual_value));
                }
                ++mismatches;
            }
        }
    }

    if (mismatches > 0)
    {
        printf("Total selected-index mismatches: %d\n", mismatches);
    }
    return is_correct && mismatches == 0;
}

inline void ExpectSelectedIndicesEqual(const int64_t* expected, const int64_t* actual,
                                       int expected_count, int actual_count)
{
    EXPECT_TRUE(CheckSelectedIndicesEqual(expected, actual, expected_count, actual_count));
}
