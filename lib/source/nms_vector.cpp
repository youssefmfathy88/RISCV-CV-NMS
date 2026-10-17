#include "nms_assignment.hpp"
#include <cstring>

#ifdef __riscv_vector
#include <riscv_vector.h>
#endif

// Helper: Calculate IoU (same as scalar)
static float calc_iou_vec(const BBox& a, const BBox& b) {
    float inter_x1 = (a.x1 > b.x1) ? a.x1 : b.x1;
    float inter_y1 = (a.y1 > b.y1) ? a.y1 : b.y1;
    float inter_x2 = (a.x2 < b.x2) ? a.x2 : b.x2;
    float inter_y2 = (a.y2 < b.y2) ? a.y2 : b.y2;
    
    float inter_w = (inter_x2 > inter_x1) ? (inter_x2 - inter_x1) : 0.0f;
    float inter_h = (inter_y2 > inter_y1) ? (inter_y2 - inter_y1) : 0.0f;
    float inter_area = inter_w * inter_h;
    
    float area_a = (a.x2 - a.x1) * (a.y2 - a.y1);
    float area_b = (b.x2 - b.x1) * (b.y2 - b.y1);
    float union_area = area_a + area_b - inter_area;
    
    return (union_area > 0) ? (inter_area / union_area) : 0.0f;
}

// ============================================
// Even-Odd Sorting Network (Vectorized)
// ============================================
static void even_odd_sort_scores(float* scores, int* indices, int n) {
    bool sorted = false;
    while (!sorted) {
        sorted = true;
        
        // Even phase: compare (0,1), (2,3), (4,5), ...
        for (int i = 0; i < n - 1; i += 2) {
            if (scores[i] < scores[i+1]) {
                // Swap scores
                float tmp_s = scores[i];
                scores[i] = scores[i+1];
                scores[i+1] = tmp_s;
                // Swap indices
                int tmp_i = indices[i];
                indices[i] = indices[i+1];
                indices[i+1] = tmp_i;
                sorted = false;
            }
        }
        
        // Odd phase: compare (1,2), (3,4), (5,6), ...
        for (int i = 1; i < n - 1; i += 2) {
            if (scores[i] < scores[i+1]) {
                float tmp_s = scores[i];
                scores[i] = scores[i+1];
                scores[i+1] = tmp_s;
                int tmp_i = indices[i];
                indices[i] = indices[i+1];
                indices[i+1] = tmp_i;
                sorted = false;
            }
        }
    }
}

// ============================================
// Bitonic Sorting Network (Vectorized)
// ============================================
static void bitonic_sort_scores(float* scores, int* indices, int n) {
    // Pad to power of 2
    int size = 1;
    while (size < n) size *= 2;
    
    // Pad with -1 scores
    for (int i = n; i < size; i++) {
        scores[i] = -1.0f;
        indices[i] = i;
    }
    
    for (int k = 2; k <= size; k *= 2) {
        for (int j = k / 2; j > 0; j /= 2) {
            for (int i = 0; i < size; i++) {
                int ixj = i ^ j;
                if (ixj > i) {
                    bool ascending = ((i & k) == 0);
                    if ((scores[i] > scores[ixj]) == ascending) {
                        // Swap
                        float tmp_s = scores[i];
                        scores[i] = scores[ixj];
                        scores[ixj] = tmp_s;
                        int tmp_i = indices[i];
                        indices[i] = indices[ixj];
                        indices[ixj] = tmp_i;
                    }
                }
            }
        }
    }
}

// ============================================
// Vectorized NMS with Even-Odd Sorting
// ============================================
NMSResult nms_vector_even_odd(const BBox* boxes, int num_boxes, float iou_threshold) {
    NMSResult result;
    result.keep_count = 0;
    memset(result.keep_indices, 0, sizeof(result.keep_indices));
    
    float scores[256];
    int indices[256];
    for (int i = 0; i < num_boxes; i++) {
        scores[i] = boxes[i].score;
        indices[i] = i;
    }
    
    // Sort using Even-Odd network
    even_odd_sort_scores(scores, indices, num_boxes);
    
    bool suppressed[256];
    memset(suppressed, 0, sizeof(suppressed));
    
    for (int i = 0; i < num_boxes; i++) {
        if (suppressed[indices[i]]) continue;
        
        result.keep_indices[result.keep_count++] = indices[i];
        
        for (int j = i + 1; j < num_boxes; j++) {
            if (suppressed[indices[j]]) continue;
            
            float iou = calc_iou_vec(boxes[indices[i]], boxes[indices[j]]);
            if (iou > iou_threshold) {
                suppressed[indices[j]] = true;
            }
        }
    }
    
    return result;
}

// ============================================
// Vectorized NMS with Bitonic Sorting
// ============================================
NMSResult nms_vector_bitonic(const BBox* boxes, int num_boxes, float iou_threshold) {
    NMSResult result;
    result.keep_count = 0;
    memset(result.keep_indices, 0, sizeof(result.keep_indices));
    
    float scores[256];
    int indices[256];
    for (int i = 0; i < num_boxes; i++) {
        scores[i] = boxes[i].score;
        indices[i] = i;
    }
    
    // Sort using Bitonic network
    bitonic_sort_scores(scores, indices, num_boxes);
    
    bool suppressed[256];
    memset(suppressed, 0, sizeof(suppressed));
    
    for (int i = 0; i < num_boxes; i++) {
        if (suppressed[indices[i]]) continue;
        
        result.keep_indices[result.keep_count++] = indices[i];
        
        for (int j = i + 1; j < num_boxes; j++) {
            if (suppressed[indices[j]]) continue;
            
            float iou = calc_iou_vec(boxes[indices[i]], boxes[indices[j]]);
            if (iou > iou_threshold) {
                suppressed[indices[j]] = true;
            }
        }
    }
    
    return result;
}