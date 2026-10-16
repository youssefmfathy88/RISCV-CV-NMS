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
    int num_of_boxes = spatial_dim;
    int output_count = 0;

    int* order = new int[num_of_boxes];
    float* packed_scores = new float[num_of_boxes];
    uint8_t* suppressed = new uint8_t[num_of_boxes];

    for (int batch = 0; batch < num_batches; batch++) {
        for (int cls = 0; cls < num_classes; cls++) {
            
            int candidate_count = 0;
            int scores_offset = (batch * num_classes + cls) * num_of_boxes;

            // 1. Score Filter
            for (int i = 0; i < num_of_boxes; i++) {
                float current_score = scores[scores_offset + i];
                
                if (score_threshold != nullptr && current_score < *score_threshold) {
                    continue;
                }
                
                packed_scores[candidate_count] = current_score;
                order[candidate_count] = i;
                suppressed[candidate_count] = 0;
                candidate_count++;
            }

            // 2. Sort 
            for (int i = 0; i < candidate_count; i++) {
                for (int j = i + 1; j < candidate_count; j++) {
                    if (packed_scores[i] < packed_scores[j]) {

                        float temp_score = packed_scores[i];
                        packed_scores[i] = packed_scores[j];
                        packed_scores[j] = temp_score;
                        
                        int temp_order = order[i];
                        order[i] = order[j];
                        order[j] = temp_order;
                    }
                }
            }

            // 3. Greedy IoU
            int selected = 0;
            int boxes_offset = batch * num_of_boxes * 4;

            for (int i = 0; i < candidate_count; i++) {
                if (suppressed[i] == 1) continue;
                if (selected >= max_output_boxes_per_class) break;

                int box_a_idx = order[i];
                
                selected_indices[output_count * 3 + 0] = batch;
                selected_indices[output_count * 3 + 1] = cls;
                selected_indices[output_count * 3 + 2] = box_a_idx;
                output_count++;
                selected++;

                float ymin_a = boxes[boxes_offset + box_a_idx * 4 + 0];
                float xmin_a = boxes[boxes_offset + box_a_idx * 4 + 1];
                float ymax_a = boxes[boxes_offset + box_a_idx * 4 + 2];
                float xmax_a = boxes[boxes_offset + box_a_idx * 4 + 3];
                
                float area_a = (ymax_a - ymin_a) * (xmax_a - xmin_a);

                for (int j = i + 1; j < candidate_count; j++) {
                    if (suppressed[j] == 1) continue;

                    int box_b_idx = order[j];
                    float ymin_b = boxes[boxes_offset + box_b_idx * 4 + 0];
                    float xmin_b = boxes[boxes_offset + box_b_idx * 4 + 1];
                    float ymax_b = boxes[boxes_offset + box_b_idx * 4 + 2];
                    float xmax_b = boxes[boxes_offset + box_b_idx * 4 + 3];

                    float overlap_ymin = (ymin_a > ymin_b) ? ymin_a : ymin_b;
                    float overlap_xmin = (xmin_a > xmin_b) ? xmin_a : xmin_b;
                    float overlap_ymax = (ymax_a < ymax_b) ? ymax_a : ymax_b;
                    float overlap_xmax = (xmax_a < xmax_b) ? xmax_a : xmax_b;

                    float overlap_h = overlap_ymax - overlap_ymin;
                    float overlap_w = overlap_xmax - overlap_xmin;

                    if (overlap_h > 0 && overlap_w > 0) {
                        float intersection = overlap_h * overlap_w;
                        float area_b = (ymax_b - ymin_b) * (xmax_b - xmin_b);
                        float union_area = area_a + area_b - intersection;
                        
                        float iou = intersection / union_area;

                        if (iou > iou_threshold) {
                            suppressed[j] = 1;
                        }
                    }
                }
            }
        }
    }

    delete[] order;
    delete[] packed_scores;
    delete[] suppressed;

    return output_count;
}
