#include "image_Add.hpp"

void ref::Add(const Image<uint8_t> &input1, 
              const Image<uint8_t> &input2, 
                    Image<uint8_t> &output, 
              const OverFlowPolicy overFlowPolicy)
{
    assert(input1.Width() == input2.Width() && input1.Height() == input2.Height());
    assert(input1.Width() == output.Width() && input1.Height() == output.Height());

    for (int y = 0; y < input1.Height(); y++)
    {
        for (int x = 0; x < input1.Width(); x++)
        {
            const uint16_t value1 = input1.GetPixel(x, y);
            const uint16_t value2 = input2.GetPixel(x, y);
            uint16_t value = value1 + value2;
            if (overFlowPolicy == OverFlowPolicy::CLAMP && value > 255)
            {
                value = 255;
            }
            output.SetPixel(x, y, static_cast<uint8_t>(value));
        }
    }
}
