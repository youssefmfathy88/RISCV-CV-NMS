#pragma once

// Shared utilities for image fill and correctness checking.

#include "image.hpp"
#include "riscv_port.hpp"

// Compare two images pixel-by-pixel, printing the first few mismatches.
template <typename T>
bool CheckCorrectness(const Image<T>& expected, const Image<T>& actual)
{
    if (expected.Width() != actual.Width() || expected.Height() != actual.Height())
    {
        return false;
    }

    bool is_correct = true;
    int mismatches = 0;

    for (int y = 0; y < expected.Height(); y++)
    {
        for (int x = 0; x < expected.Width(); x++)
        {
            if (expected.GetPixel(x, y) != actual.GetPixel(x, y))
            {
                is_correct = false;
                if (mismatches < 8) // cap the UART spam on large images
                {
                    printf("Mismatch at (%d, %d): expected = %d, actual = %d\n",
                           x, y,
                           static_cast<int>(expected.GetPixel(x, y)),
                           static_cast<int>(actual.GetPixel(x, y)));
                }
                ++mismatches;
            }
        }
    }

    if (mismatches > 0)
    {
        printf("Total mismatches: %d\n", mismatches);
    }
    return is_correct;
}

// Deterministic random fill using klib's rand() with a fixed seed
template <typename T>
class RandomInt
{
public:
    RandomInt(T min, T max, unsigned int seed = 0xC0FFEE)
        : min_(static_cast<int>(min)), span_(static_cast<int>(max) - static_cast<int>(min) + 1)
    {
        srand(seed);
    }

    T get()
    {
        return static_cast<T>(min_ + (rand() % span_));
    }

    void ImageRandomInitialize(Image<T>& image)
    {
        for (int y = 0; y < image.Height(); y++)
        {
            for (int x = 0; x < image.Width(); x++)
            {
                image.SetPixel(x, y, get());
            }
        }
    }

private:
    int min_;
    int span_;
};
