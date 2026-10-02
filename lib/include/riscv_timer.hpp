#pragma once

// Cycle-accurate timing for the XiangShan/gem5 target.

#include <cstdint>


inline uint64_t ReadCycles()
{
    uint64_t value;
    asm volatile("csrr %0, cycle" : "=r"(value));
    return value;
}

inline uint64_t ReadInstructions()
{
    uint64_t value;
    asm volatile("csrr %0, instret" : "=r"(value));
    return value;
}

struct CycleSample
{
    uint64_t cycles;
    uint64_t instructions;
};

inline CycleSample Sample()
{
    return {ReadCycles(), ReadInstructions()};
}

inline CycleSample Delta(const CycleSample& end, const CycleSample& start)
{
    return {end.cycles - start.cycles, end.instructions - start.instructions};
}

// Start/stop timer built on the CSR readers above.
class Timer
{
public:
    void Start()
    {
        start_ = Sample();
    }

    void Stop()
    {
        stop_ = Sample();
    }

    uint64_t ElapsedCycles() const
    {
        return Delta(stop_, start_).cycles;
    }

    uint64_t ElapsedInstructions() const
    {
        return Delta(stop_, start_).instructions;
    }

private:
    CycleSample start_{};
    CycleSample stop_{};
};

