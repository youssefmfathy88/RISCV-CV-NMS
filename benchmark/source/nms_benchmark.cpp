#include "../../lib/include/nms_assignment.hpp"
#include <cstdio>
#include <cstdint>
#include <cstdint>  // <-- Add this for uint64_t

// RISC-V cycle counter
static inline uint64_t get_cycles() {
    uint64_t cycles;
    asm volatile("rdcycle %0" : "=r"(cycles));
    return cycles;
}

// Generate test bounding boxes
static void generate_test_boxes(BBox* boxes, int num_boxes) {
    for (int i = 0; i < num_boxes; i++) {
        boxes[i].x1 = (float)(i % 10) * 10.0f;
        boxes[i].y1 = (float)(i / 10) * 10.0f;
        boxes[i].x2 = boxes[i].x1 + 20.0f;
        boxes[i].y2 = boxes[i].y1 + 20.0f;
        boxes[i].score = (float)(num_boxes - i) / num_boxes;
        boxes[i].label = i % 3;
    }
}

int main() {
    const int NUM_BOXES = 64;
    const float IOU_THRESHOLD = 0.5f;
    
    BBox boxes[256];
    generate_test_boxes(boxes, NUM_BOXES);
    
    printf("=== NMS Performance Benchmark ===\n");
    printf("Number of boxes: %d\n", NUM_BOXES);
    printf("IoU Threshold: %.2f\n\n", IOU_THRESHOLD);
    
    // Benchmark Scalar NMS
    uint64_t start = get_cycles();
    NMSResult scalar_result = nms_scalar(boxes, NUM_BOXES, IOU_THRESHOLD);
    uint64_t scalar_cycles = get_cycles() - start;
    
    printf("Scalar NMS:\n");
    printf("  Cycles: %lu\n", scalar_cycles);
    printf("  Boxes kept: %d\n\n", scalar_result.keep_count);
    
    // Benchmark Vectorized NMS with Even-Odd Sorting
    start = get_cycles();
    NMSResult even_odd_result = nms_vector_even_odd(boxes, NUM_BOXES, IOU_THRESHOLD);
    uint64_t even_odd_cycles = get_cycles() - start;
    
    printf("Vectorized NMS (Even-Odd Sort):\n");
    printf("  Cycles: %lu\n", even_odd_cycles);
    printf("  Boxes kept: %d\n", even_odd_result.keep_count);
    printf("  Speedup vs Scalar: %.2fx\n\n", 
           (float)scalar_cycles / (float)even_odd_cycles);
    
    // Benchmark Vectorized NMS with Bitonic Sorting
    start = get_cycles();
    NMSResult bitonic_result = nms_vector_bitonic(boxes, NUM_BOXES, IOU_THRESHOLD);
    uint64_t bitonic_cycles = get_cycles() - start;
    
    printf("Vectorized NMS (Bitonic Sort):\n");
    printf("  Cycles: %lu\n", bitonic_cycles);
    printf("  Boxes kept: %d\n", bitonic_result.keep_count);
    printf("  Speedup vs Scalar: %.2fx\n\n", 
           (float)scalar_cycles / (float)bitonic_cycles);
    
    // Comparison: Even-Odd vs Bitonic
    printf("=== Sorting Algorithm Comparison ===\n");
    printf("Even-Odd Sort: %lu cycles\n", even_odd_cycles);
    printf("Bitonic Sort:  %lu cycles\n", bitonic_cycles);
    
    if (even_odd_cycles < bitonic_cycles) {
        printf("Winner: Even-Odd Sort (%.2fx faster)\n", 
               (float)bitonic_cycles / (float)even_odd_cycles);
    } else {
        printf("Winner: Bitonic Sort (%.2fx faster)\n", 
               (float)even_odd_cycles / (float)bitonic_cycles);
    }
    
    return 0;
}