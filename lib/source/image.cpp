#include "image.hpp"

#ifdef RISCV_BAREMETAL
#include "riscv_utils.hpp"
#endif

#ifdef RISCV_QEMU

#include <cstdio>
#include <cstdlib>
#include <cstring>

void ImageIoError(const char* message)
{
    fprintf(stderr, "%s\n", message);
    abort();
}

void SkipWhitespaceAndComments(FILE* file)
{
    int c = 0;
    while ((c = fgetc(file)) != EOF)
    {
        if (c == '#')
        {
            while ((c = fgetc(file)) != EOF && c != '\n')
            {
            }
            continue;
        }

        if (c == ' ' || c == '\t' || c == '\r' || c == '\n')
        {
            continue;
        }

        ungetc(c, file);
        return;
    }
}

int ReadInt(FILE* file, const char* error_message)
{
    SkipWhitespaceAndComments(file);
    int value = 0;
    if (fscanf(file, "%d", &value) != 1)
    {
        ImageIoError(error_message);
    }
    return value;
}

bool IsGrayMagic(const char* magic)
{
    return strcmp(magic, "P2") == 0 || strcmp(magic, "P5") == 0;
}

bool IsRgbMagic(const char* magic)
{
    return strcmp(magic, "P3") == 0 || strcmp(magic, "P6") == 0;
}

bool IsAsciiMagic(const char* magic)
{
    return strcmp(magic, "P2") == 0 || strcmp(magic, "P3") == 0;
}

template <typename T, ImageType Type>
void Image<T, Type>::Read(const char* path)
{
    assert(path != nullptr);

    FILE* file = fopen(path, "rb");
    if (file == nullptr)
    {
        fprintf(stderr, "Image::Read: failed to open '%s'\n", path);
        abort();
    }

    char magic[3] = {};
    if (fread(magic, 1, 2, file) != 2 || magic[2] != '\0')
    {
        ImageIoError("Image::Read: failed to read PGM/PPM magic");
    }

    const bool gray_magic = IsGrayMagic(magic);
    const bool rgb_magic = IsRgbMagic(magic);
    if (!gray_magic && !rgb_magic)
    {
        ImageIoError("Image::Read: unsupported PGM/PPM magic (expected P2/P3/P5/P6)");
    }

    if constexpr (Type == ImageType::GRAY)
    {
        if (!gray_magic)
        {
            ImageIoError("Image::Read: image type is GRAY but file is RGB");
        }
    }
    else
    {
        if (!rgb_magic)
        {
            ImageIoError("Image::Read: image type is RGB but file is GRAY");
        }
    }

    const int file_width = ReadInt(file, "Image::Read: failed to read width");
    const int file_height = ReadInt(file, "Image::Read: failed to read height");
    const int maxval = ReadInt(file, "Image::Read: failed to read maxval");

    if (data != nullptr)
    {
        delete[] data;
        data = nullptr;
    }

    if (maxval != 255 || file_width <= 0 || file_height <= 0)
    {
        ImageIoError("Image::Read: unsupported image size or maxval");
        abort();
    }

    // Allocate new data
    Allocate(file_width, file_height);

    if (IsAsciiMagic(magic))
    {
        for (int i = 0; i < stride * height; ++i)
        {
            int value = ReadInt(file, "Image::Read: failed to read ASCII pixel data");
            if (value < 0 || value > 255)
            {
                fprintf(stderr, "Image::Read: pixel value %d out of range [0, 255]\n", value);
                abort();
            }
            data[i] = static_cast<T>(value);
        }
    }
    else
    {
        SkipWhitespaceAndComments(file);
        const size_t byte_count = static_cast<size_t>(stride * height) * sizeof(T);
        if (fread(data, 1, byte_count, file) != byte_count)
        {
            ImageIoError("Image::Read: failed to read binary pixel data");
        }
    }

    fclose(file);
}

template <typename T, ImageType Type>
void Image<T, Type>::Write(const char* path) const
{
    assert(path != nullptr);

    FILE* file = fopen(path, "wb");
    if (file == nullptr)
    {
        fprintf(stderr, "Image::Write: failed to open '%s'\n", path);
        abort();
    }

    const char* magic = (Type == ImageType::GRAY) ? "P5" : "P6";
    if (fprintf(file, "%s\n%d %d\n255\n", magic, width, height) < 0)
    {
        ImageIoError("Image::Write: failed to write PGM/PPM header");
    }

    const size_t byte_count =
        static_cast<size_t>(width) * static_cast<size_t>(height) *
        static_cast<size_t>(Channels()) * sizeof(T);

    if (fwrite(data, 1, byte_count, file) != byte_count)
    {
        ImageIoError("Image::Write: failed to write pixel data");
    }

    if (fclose(file) != 0)
    {
        ImageIoError("Image::Write: failed to close output file");
    }

    
}

template void Image<uint8_t, ImageType::GRAY>::Read(const char*);
template void Image<uint8_t, ImageType::RGB>::Read(const char*);
template void Image<uint8_t, ImageType::GRAY>::Write(const char*) const;
template void Image<uint8_t, ImageType::RGB>::Write(const char*) const;

#else

template <typename T, ImageType Type>
void Image<T, Type>::Read(int new_width, int new_height, const uint8_t* buffer)
{
    assert(buffer != nullptr);

    if (data != nullptr)
    {
        delete[] data;
        data = nullptr;
    }

    Allocate(new_width, new_height);
    memcpy(data, buffer, stride * height * sizeof(T));
}

template void Image<uint8_t, ImageType::GRAY>::Read(int, int, const uint8_t*);
template void Image<uint8_t, ImageType::RGB>::Read(int, int, const uint8_t*);
#endif // RISCV_QEMU
