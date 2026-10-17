#ifndef NMS_ASSIGNMENT_HPP
#define NMS_ASSIGNMENT_HPP

#include <cstdint>
#include <cstddef>

// Bounding box structure for assignment
struct BBox {
    float x1, y1, x2, y2;  // Top-left and bottom-right coordinates
    float score;           // Confidence score
    int label;             // Class label
};

// NMS Result
struct NMSResult {
    int keep_count;        // Number of boxes kept after NMS
    int keep_indices[256]; // Indices of kept boxes
};

// Scalar (reference) NMS implementation
NMSResult nms_scalar(const BBox* boxes, int num_boxes, float iou_threshold);

// Vectorized NMS implementations
NMSResult nms_vector_even_odd(const BBox* boxes, int num_boxes, float iou_threshold);
NMSResult nms_vector_bitonic(const BBox* boxes, int num_boxes, float iou_threshold);

#endif // NMS_ASSIGNMENT_HPP
