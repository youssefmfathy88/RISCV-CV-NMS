#include "gtest_lite.hpp"

#include <tuple>

#include "riscv_cv.hpp"
#include "reference_cv.hpp"
#include "test_utils.hpp"

class AddTest : public ::testing::TestWithParam<std::tuple<int, int, OverFlowPolicy>>
{
};

TEST_P(AddTest, VectorizedMatchesReference)
{
    const auto [width, height, overFlowPolicy] = GetParam();

    Image<uint8_t> input0(width, height);
    Image<uint8_t> input1(width, height);

    Image<uint8_t> output_reference(width, height);
    Image<uint8_t> output_vectorized(width, height);

    RandomInt<uint8_t> random(0, 255);
    random.ImageRandomInitialize(input0);
    random.ImageRandomInitialize(input1);

    ref::Add(input0, input1, output_reference, overFlowPolicy);
    vec::Add(input0, input1, output_vectorized, overFlowPolicy);

    ExpectImagesEqual(output_reference, output_vectorized);
}

INSTANTIATE_TEST_SUITE_P(ImageSizesAndKernels, AddTest,
    ::testing::Combine(
        ::testing::Values(66),   // width
        ::testing::Values(40),   // height
        ::testing::Values(OverFlowPolicy::CLAMP, OverFlowPolicy::WRAP))
    );
