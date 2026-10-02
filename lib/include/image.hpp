#pragma once

#include "riscv_port.hpp"
#include "types.hpp"
#include <cstddef>
#include <cstdint>

enum class ImageType
{
    GRAY,
    RGB,
};

template <typename T, ImageType Type = ImageType::GRAY>
class Image
{
private:
    int width;
    int height;
    int stride;

    T* data;

    static constexpr int Channels()
    {
        return Type == ImageType::GRAY ? 1 : 3;
    }

    int index(const int x, const int y, const int c = 0) const
    {
        return y * stride + x;
    }

    void Allocate(int _width, int _height)
    {
        assert(_width > 0 && _height > 0);
        width = _width;
        height = _height;
        stride = _width * Channels();
        data = new T[stride * _height];
    }

public:
    Image() : width(0), height(0), stride(0), data(nullptr) {}
    Image(int width, int height)
    {
        Allocate(width, height);
    }

    ~Image()
    {
        delete[] data;
    }

    Image(const Image&) = delete;
    Image& operator=(const Image&) = delete;

    T GetPixel(const int x, const int y) const
    {
        return data[index(x, y)];
    }

    void SetPixel(const int x, const int y, const T& value)
    {
        data[index(x, y)] = value;
    }

    T* GetPtr(const int x, const int y)
    {
        return data + index(x, y);
    }

    const T* GetPtr(const int x, const int y) const
    {
        return data + index(x, y);
    }

#ifdef RISCV_QEMU
    // PGM/PPM file I/O. Only available on qemu-user (hosted libc).
    // Read accepts ASCII (P2/P3) and binary (P5/P6). Write always binary.
    void Read(const char* path);
    void Write(const char* path) const;
#else
    void Read(int new_width, int new_height, const uint8_t* buffer);
#endif

    int Width() const noexcept { return width; }
    int Height() const noexcept { return height; }
};