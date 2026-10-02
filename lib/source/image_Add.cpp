#include "image_Add.hpp"

#if defined(__riscv_vector)
#include "riscv_wrappers.hpp"
#endif

void vec::Add(const Image<uint8_t> &input0, 
              const Image<uint8_t> &input1, 
                    Image<uint8_t> &output, 
              const OverFlowPolicy overFlowPolicy)
{
    assert(input0.Width() == input1.Width() && input0.Height() == input1.Height());
    assert(input0.Width() == output.Width() && input0.Height() == output.Height());

#if defined(__riscv_vector)
    const uint8_t* in0 = input0.GetPtr(0, 0);
    const uint8_t* in1 = input1.GetPtr(0, 0);
    uint8_t* out = output.GetPtr(0, 0);
    size_t remaining = static_cast<size_t>(input0.Width()) * input0.Height();
    size_t offset = 0;

    if (overFlowPolicy == OverFlowPolicy::CLAMP)
    {
        while (remaining > 0)
        {
            const size_t vl = rvv::SetVlU8M4(remaining);
            rvv::U8M4 a = rvv::LoadU8M4(in0 + offset, vl);
            rvv::U8M4 b = rvv::LoadU8M4(in1 + offset, vl);
            rvv::U8M4 sum = rvv::AddU8SaturatingM4(a, b, vl);
            rvv::StoreU8M4(out + offset, sum, vl);
            offset += vl;
            remaining -= vl;
        }
    }
    else
    {
        while (remaining > 0)
        {
            const size_t vl = rvv::SetVlU8M4(remaining);
            rvv::U8M4 a = rvv::LoadU8M4(in0 + offset, vl);
            rvv::U8M4 b = rvv::LoadU8M4(in1 + offset, vl);
            rvv::U8M4 sum = rvv::AddU8WrappingM4(a, b, vl);
            rvv::StoreU8M4(out + offset, sum, vl);
            offset += vl;
            remaining -= vl;
        }
    }
#else
    for (int y = 0; y < input0.Height(); y++)
    {
        for (int x = 0; x < input0.Width(); x++)
        {
            const uint16_t value0 = input0.GetPixel(x, y);
            const uint16_t value1 = input1.GetPixel(x, y);
            uint16_t value = value0 + value1;
            if (overFlowPolicy == OverFlowPolicy::CLAMP && value > 255)
            {
                value = 255;
            }
            output.SetPixel(x, y, static_cast<uint8_t>(value));
        }
    }
#endif
}
