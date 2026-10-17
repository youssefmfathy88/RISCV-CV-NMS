#include "nms_assignment.hpp"
#include <algorithm>
#include <cstring>

float calculate_iou(const BBox& a, const BBox& b) {
    float inter_x1 = std::max(a.x1, b.x1);
    float inter_y1 = std::max(a.y1, b.y1);
    float inter_x2 = std::min(a.x2, b.x2);
    float inter_y2 = std::min(a.y2, b.y2);
    
    float inter_area = std::max(0.0f, inter_x2 - inter_x1) * 
                       std::max(0.0f, inter_y2 - inter_y1);
    
    float area_a = (a.x2 - a.x1) * (a.y2 - a.y1);
    float area_b = (b.x2 - b.x1) * (b.y2 - b.y1);
    float union_area = area_a + area_b - inter_area;
    
    return (union_area > 0) ? (inter_area / union_area) : 0.0f;
}

NMSResult nms_scalar(const BBox* boxes, int num_boxes, float iou_threshold) {
    NMSResult result;
    result.keep_count = 0;
    memset(result.keep_indices, 0, sizeof(result.keep_indices));
    
    // Create a copy of indices sorted by score (descending)
    int indices[256];
    for (int i = 0; i < num_boxes; i++) indices[i] = i;
    
    // Simple bubble sort by score (descending)
    for (int i = 0; i < num_boxes - 1; i++) {
        for (int j = 0; j < num_boxes - i - 1; j++) {
            if (boxes[indices[j]].score < boxes[indices[j+1]].score) {
                std::swap(indices[j], indices[j+1]);
            }
        }
    }
    
    bool suppressed[256];
    memset(suppressed, 0, sizeof(suppressed));
    
    for (int i = 0; i < num_boxes; i++) {
        if (suppressed[indices[i]]) continue;
        
        result.keep_indices[result.keep_count++] = indices[i];
        
        for (int j = i + 1; j < num_boxes; j++) {
            if (suppressed[indices[j]]) continue;
            
            float iou = calculate_iou(boxes[indices[i]], boxes[indices[j]]);
            if (iou > iou_threshold) {
                suppressed[indices[j]] = true;
            }
        }
    }
    
    return result;
}