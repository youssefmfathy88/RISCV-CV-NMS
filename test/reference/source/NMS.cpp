#include "NMS.hpp"

// Student exercise: scalar NonMaxSuppression.
// The contract is in test/reference/include/NMS.hpp (same as vec::). Match the
// ONNX golden fixtures used by NMS_test (test/unit_test/include/nms_onnx_cases.hpp).
// Keep this file scalar: no RVV intrinsics and no riscv_wrappers.hpp.
int ref::NonMaxSuppression(const float* boxes,
                           const float* scores,
                           int num_batches,
                           int num_classes,
                           int spatial_dim,
                           int64_t max_output_boxes_per_class,
                           float iou_threshold,
                           const float* score_threshold,
                           CenterPointBox center_point_box,
                           int64_t* selected_indices)
{
    (void)boxes;
    (void)scores;
    (void)num_batches;
    (void)num_classes;
    (void)spatial_dim;
    (void)max_output_boxes_per_class;
    (void)iou_threshold;
    (void)score_threshold;
    (void)center_point_box;
    (void)selected_indices;
    return 0;
}
