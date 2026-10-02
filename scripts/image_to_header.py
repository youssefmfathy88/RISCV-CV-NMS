#!/usr/bin/env python3
"""
Convert an image (PNG/JPEG/PGM/etc. via Pillow) to a C++ header with
{symbol}_width, {symbol}_height, {symbol}_channels, and {symbol}_data[].

CLI:
  python3 scripts/image_to_header.py <in.png|jpg|pgm|...> -o <out.hpp> -s <symbol>

--symbol defaults to the input filename stem. Grayscale images stay 1 channel;
color images are converted to RGB (3 channels).

C++ usage:
  Image<uint8_t> input;
  input.Read(symbol_width, symbol_height, symbol_data);
"""

import argparse
import os
import sys


def main():
    try:
        from PIL import Image
    except ImportError:
        print("Pillow is required. Install it with: pip install Pillow", file=sys.stderr)
        sys.exit(1)

    parser = argparse.ArgumentParser(
        description="Convert an image file to a C++ header with pixel data."
    )
    parser.add_argument("input", help="Input image (PNG, JPEG, PGM, PPM, BMP, etc.)")
    parser.add_argument("-o", "--output", required=True, help="Output header path")
    parser.add_argument("-s", "--symbol", default=None, help="Symbol prefix for generated constants (default: input filename stem)")
    args = parser.parse_args()

    symbol = args.symbol
    if symbol is None:
        symbol = os.path.splitext(os.path.basename(args.input))[0]
        symbol = symbol.replace("-", "_").replace(".", "_")

    img = Image.open(args.input)

    if img.mode in ("L", "1"):
        img = img.convert("L")
        channels = 1
    else:
        img = img.convert("RGB")
        channels = 3

    width, height = img.size
    if hasattr(img, "get_flattened_data"):
        pixels = img.get_flattened_data()
        data = list(pixels) if channels == 1 else [c for pixel in pixels for c in pixel]
    else:
        pixels = list(img.getdata())
        data = pixels if channels == 1 else [c for pixel in pixels for c in pixel]

    bytes_per_line = 16
    hex_lines = []
    for i in range(0, len(data), bytes_per_line):
        chunk = data[i : i + bytes_per_line]
        hex_lines.append(", ".join(f"0x{b:02x}" for b in chunk))

    data_body = ",\n    ".join(hex_lines)

    header = f"""#pragma once
#include <cstdint>

inline constexpr int {symbol}_width = {width};
inline constexpr int {symbol}_height = {height};
inline constexpr int {symbol}_channels = {channels};   // 1 = GRAY, 3 = RGB
inline constexpr unsigned char {symbol}_data[] = {{
    {data_body}
}};
"""

    with open(args.output, "w", encoding="ascii") as f:
        f.write(header)


if __name__ == "__main__":
    main()