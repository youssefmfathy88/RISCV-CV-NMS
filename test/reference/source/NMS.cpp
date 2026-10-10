#include "NMS.hpp"
#include <algorithm>  
#include <cstdint>

static constexpr int MAX_BOXES = 4096;   // must be >= the largest spatial_dim in the tests

struct Box { float xmin, ymin, xmax, ymax; };

// ---- Step 2a: normalize either box format to (xmin, ymin, xmax, ymax) -------
static inline Box to_corners(const float* box, CenterPointBox cpb)
{
    Box r;
    if (cpb == CenterPointBox::Corners) {                 // [y1, x1, y2, x2], any diagonal pair
        r.xmin = std::min(box[1], box[3]);
        r.ymin = std::min(box[0], box[2]);
        r.xmax = std::max(box[1], box[3]);
        r.ymax = std::max(box[0], box[2]);
    } else {                              // [x_center, y_center, width, height]
        r.xmin = box[0] - box[2] * 0.5f;
        r.ymin = box[1] - box[3] * 0.5f;
        r.xmax = box[0] + box[2] * 0.5f;
        r.ymax = box[1] + box[3] * 0.5f;
    }
    return r;
}

// ---- Step 2b: intersection over union --------------------------------------
static inline float iou(const Box& A, const Box& B)
{
    // overlap starts at the later start, ends at the earlier end; negative -> 0
    float inter_w    = std::max(0.0f, std::min(A.xmax, B.xmax) - std::max(A.xmin, B.xmin));
    float inter_h    = std::max(0.0f, std::min(A.ymax, B.ymax) - std::max(A.ymin, B.ymin));
    float inter_area = inter_w * inter_h;

    float area_a     = (A.xmax - A.xmin) * (A.ymax - A.ymin);
    float area_b     = (B.xmax - B.xmin) * (B.ymax - B.ymin);
    float union_area = area_a + area_b - inter_area;

    if (union_area <= 0.0f) return 0.0f;  // degenerate boxes never suppress
    return inter_area / union_area;
}

// ---- Step 3b helper: sort order (score desc, ties -> lower index first) ------
static inline bool comes_before(int a, int b, const float* s)
{
    return s[a] > s[b] || (s[a] == s[b] && a < b);
}

// ============================================================================
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
    static int candidates[MAX_BOXES];   // box indices passing the score filter, per (b, c)
    static int kept[MAX_BOXES];         // box indices selected so far, per (b, c)

    if (spatial_dim > MAX_BOXES) return -1;          // check what the harness expects on error
    if (max_output_boxes_per_class <= 0) return 0;   // nothing may be selected

    // Optional input: test the pointer and read the value once, outside all loops
    const bool  has_thr = (score_threshold != nullptr);
    const float thr     = has_thr ? *score_threshold : 0.0f;

    int num_selected = 0;   // triplets written to selected_indices (whole output)

    for (int b = 0; b < num_batches; ++b) {
        for (int c = 0; c < num_classes; ++c) {
            
            // scores layout: [num_batches][num_classes][spatial_dim]
            const float* class_scores = scores + (b * num_classes + c) * spatial_dim;

            // ---- Step 3a: score filter -> candidates ------------------------
            int num_cand = 0;
            for (int i = 0; i < spatial_dim; ++i) {
                if (!has_thr || class_scores[i] > thr) {
                    candidates[num_cand] = i;
                    num_cand++;
                }
            }

            // ---- Step 3b: insertion sort on indices (argsort) ---------------
            for (int i = 1; i < num_cand; ++i) {
                int key = candidates[i];             // box index
                int j = i - 1;                       // position in candidates
                while (j >= 0 && comes_before(key, candidates[j], class_scores)) {
                    candidates[j + 1] = candidates[j];
                    j--;
                }
                candidates[j + 1] = key;
            }

            // ---- Step 4: greedy selection -----------------------------------
            int num_kept = 0;
            for (int k = 0; k < num_cand; ++k) {
                if (num_kept >= max_output_boxes_per_class) break;

                // boxes layout: [num_batches][spatial_dim][4]
                int cand = candidates[k];
                Box A = to_corners(boxes + (b * spatial_dim + cand) * 4, center_point_box);

                bool suppressed = false;
                for (int s = 0; s < num_kept; ++s) {
                    Box B = to_corners(boxes + (b * spatial_dim + kept[s]) * 4, center_point_box);
                    if (iou(A, B) > iou_threshold) { suppressed = true; break; }
                }

                if (!suppressed) {
                    kept[num_kept] = cand;
                    num_kept++;

                    // ---- Step 5: write triplet {batch, class, box} ----------
                    // selected_indices layout: [num_selected][3]
                    selected_indices[num_selected * 3 + 0] = b;
                    selected_indices[num_selected * 3 + 1] = c;
                    selected_indices[num_selected * 3 + 2] = cand;
                    num_selected++;
                }
            }
        }
    }
    return num_selected;
}