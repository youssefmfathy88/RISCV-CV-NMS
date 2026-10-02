#pragma once
#include "types.hpp"

namespace vec 
{
    void Add(const Image<uint8_t>& input1, 
             const Image<uint8_t>& input2, 
                   Image<uint8_t>& output, 
             const OverFlowPolicy overFlowPolicy);
}
