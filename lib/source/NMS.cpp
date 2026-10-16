#include "NMS.hpp"
#include "riscv_wrappers.hpp"

int vec::NonMaxSuppression(const float* boxes,
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
    // ==========================================
    // Toggle Sorting Algorithm
    // ==========================================
    bool use_bitonic = true; 

    int num_of_boxes = spatial_dim;
    int output_count = 0;
    int max_pow2 = 1;
    while (max_pow2 < num_of_boxes) {
        max_pow2 *= 2;
    }

    int* order = new int[max_pow2];
    float* packed_scores = new float[max_pow2];
    uint8_t* suppressed = new uint8_t[max_pow2];

    float* soa_ymin = new float[num_of_boxes];
    float* soa_xmin = new float[num_of_boxes];
    float* soa_ymax = new float[num_of_boxes];
    float* soa_xmax = new float[num_of_boxes];
    float* soa_area = new float[num_of_boxes];

    for (int batch = 0; batch < num_batches; batch++) {
        for (int cls = 0; cls < num_classes; cls++) {
            
            int candidate_count = 0;
            int scores_offset = (batch * num_classes + cls) * num_of_boxes;
            const float* current_class_scores = scores + scores_offset;

            // ==========================================
            // 1. Vectorized Score Suppression
            // ==========================================
            size_t elements_left = num_of_boxes;
            size_t current_index = 0;

            while (elements_left > 0) {
                size_t vl = rvv::SetVlF32M4(elements_left);
                rvv::F32M4 v_scores = rvv::LoadF32M4(current_class_scores + current_index, vl);
                
                rvv::U32M4 v_indices = rvv::IotaU32M4(vl);
                v_indices = rvv::AddU32M4(v_indices, current_index, vl);

                if (score_threshold != nullptr) {
                    rvv::MaskF32M4 keep_mask = rvv::MaskF32GreaterEqualScalarM4(v_scores, *score_threshold, vl);
                    
                    rvv::F32M4 v_kept_scores = rvv::CompressF32M4(v_scores, keep_mask, vl);
                    rvv::U32M4 v_kept_indices = rvv::CompressU32M4(v_indices, keep_mask, vl);
                    
                    size_t kept_count = rvv::CountTrueF32M4(keep_mask, vl);

                    rvv::StoreF32M4(packed_scores + candidate_count, v_kept_scores, kept_count);
                    rvv::StoreI32M4(order + candidate_count, rvv::BitcastU32ToI32M4(v_kept_indices), kept_count);
                    
                    candidate_count += kept_count;
                } else {
                    rvv::StoreF32M4(packed_scores + candidate_count, v_scores, vl);
                    rvv::StoreI32M4(order + candidate_count, rvv::BitcastU32ToI32M4(v_indices), vl);
                    candidate_count += vl;
                }

                elements_left -= vl;
                current_index += vl;
            }

            if (candidate_count == 0) continue;

            // ==========================================
            // 2. Vectorized Sorting (Bitonic vs Even-Odd)
            // ==========================================
            if (use_bitonic) {

                int N = 1;
                while (N < candidate_count) {
                    N *= 2;
                }

                for (int i = candidate_count; i < N; i++) {
                    packed_scores[i] = -1.0f;
                    order[i] = -1;
                }

                for (int k = 2; k <= N; k *= 2) {
                    for (int j = k / 2; j > 0; j /= 2) {
                        for (int i = 0; i < N; i += 2 * j) {
                            
                            bool sort_descending = ((i & k) == 0);

                            size_t elements_in_block = j;
                            size_t offset = 0;

                            while (elements_in_block > 0) {
                                size_t vl = rvv::SetVlF32M4(elements_in_block);

                                rvv::F32M4 v_L = rvv::LoadF32M4(packed_scores + i + offset, vl);
                                rvv::F32M4 v_R = rvv::LoadF32M4(packed_scores + i + j + offset, vl);

                                rvv::I32M4 v_L_idx = rvv::LoadI32M4(order + i + offset, vl);
                                rvv::I32M4 v_R_idx = rvv::LoadI32M4(order + i + j + offset, vl);

                                rvv::MaskF32M4 swap_mask;
                                if (sort_descending) {
                                    swap_mask = rvv::MaskF32LessThanM4(v_L, v_R, vl);
                                } else {
                                    swap_mask = rvv::MaskF32LessThanM4(v_R, v_L, vl);
                                }

                                rvv::F32M4 v_new_L = rvv::MergeF32M4(v_L, v_R, swap_mask, vl);
                                rvv::F32M4 v_new_R = rvv::MergeF32M4(v_R, v_L, swap_mask, vl);

                                rvv::I32M4 v_new_L_idx = rvv::MergeI32M4(v_L_idx, v_R_idx, swap_mask, vl);
                                rvv::I32M4 v_new_R_idx = rvv::MergeI32M4(v_R_idx, v_L_idx, swap_mask, vl);

                                rvv::StoreF32M4(packed_scores + i + offset, v_new_L, vl);
                                rvv::StoreF32M4(packed_scores + i + j + offset, v_new_R, vl);
                                rvv::StoreI32M4(order + i + offset, v_new_L_idx, vl);
                                rvv::StoreI32M4(order + i + j + offset, v_new_R_idx, vl);

                                elements_in_block -= vl;
                                offset += vl;
                            }
                        }
                    }
                }
            } else {
                // Vectorized Even-Odd Sort
                ptrdiff_t stride_bytes = 2 * sizeof(float);
                ptrdiff_t stride_bytes_int = 2 * sizeof(int);

                for (int phase = 0; phase < candidate_count; phase++) {
                    int start_offset = phase & 1;
                    size_t pairs_left = (candidate_count - start_offset) / 2;
                    size_t offset_idx = start_offset;

                    while (pairs_left > 0) {
                        size_t vl = rvv::SetVlF32M4(pairs_left);

                        rvv::F32M4 v_left = rvv::LoadStridedF32M4(packed_scores + offset_idx, stride_bytes, vl);
                        rvv::F32M4 v_right = rvv::LoadStridedF32M4(packed_scores + offset_idx + 1, stride_bytes, vl);

                        rvv::I32M4 v_left_idx = rvv::LoadStridedI32M4(order + offset_idx, stride_bytes_int, vl);
                        rvv::I32M4 v_right_idx = rvv::LoadStridedI32M4(order + offset_idx + 1, stride_bytes_int, vl);

                        rvv::MaskF32M4 swap_mask = rvv::MaskF32LessThanM4(v_left, v_right, vl);

                        rvv::F32M4 v_new_left = rvv::MergeF32M4(v_left, v_right, swap_mask, vl);
                        rvv::F32M4 v_new_right = rvv::MergeF32M4(v_right, v_left, swap_mask, vl);

                        rvv::I32M4 v_new_left_idx = rvv::MergeI32M4(v_left_idx, v_right_idx, swap_mask, vl);
                        rvv::I32M4 v_new_right_idx = rvv::MergeI32M4(v_right_idx, v_left_idx, swap_mask, vl);

                        rvv::StoreStridedF32M4(packed_scores + offset_idx, stride_bytes, v_new_left, vl);
                        rvv::StoreStridedF32M4(packed_scores + offset_idx + 1, stride_bytes, v_new_right, vl);
                        rvv::StoreStridedI32M4(order + offset_idx, stride_bytes_int, v_new_left_idx, vl);
                        rvv::StoreStridedI32M4(order + offset_idx + 1, stride_bytes_int, v_new_right_idx, vl);

                        pairs_left -= vl;
                        offset_idx += vl * 2;
                    }
                }
            }

            // ==========================================
            // 3. Data Packing (SoA) for Vectorized IoU
            // ==========================================
            int boxes_offset = batch * num_of_boxes * 4;

            for (int i = 0; i < candidate_count; i++) {
                int box_idx = order[i];
                float y1 = boxes[boxes_offset + box_idx * 4 + 0];
                float x1 = boxes[boxes_offset + box_idx * 4 + 1];
                float y2 = boxes[boxes_offset + box_idx * 4 + 2];
                float x2 = boxes[boxes_offset + box_idx * 4 + 3];

                soa_ymin[i] = y1;
                soa_xmin[i] = x1;
                soa_ymax[i] = y2;
                soa_xmax[i] = x2;
                soa_area[i] = (y2 - y1) * (x2 - x1);
                suppressed[i] = 0;
            }

            // ==========================================
            // 4. Vectorized Greedy IoU
            // ==========================================
            int selected = 0;

            for (int i = 0; i < candidate_count; i++) {
                if (suppressed[i] == 1) continue;
                if (selected >= max_output_boxes_per_class) break;

                selected_indices[output_count * 3 + 0] = batch;
                selected_indices[output_count * 3 + 1] = cls;
                selected_indices[output_count * 3 + 2] = order[i];
                output_count++;
                selected++;

                float ymin_a = soa_ymin[i];
                float xmin_a = soa_xmin[i];
                float ymax_a = soa_ymax[i];
                float xmax_a = soa_xmax[i];
                float area_a = soa_area[i];

                size_t remain_iou = candidate_count - i - 1;
                size_t iou_idx = i + 1;

                while (remain_iou > 0) {
                    size_t vl = rvv::SetVlF32M2(remain_iou);

                    rvv::F32M2 v_ymin_b = rvv::LoadF32M2(soa_ymin + iou_idx, vl);
                    rvv::F32M2 v_xmin_b = rvv::LoadF32M2(soa_xmin + iou_idx, vl);
                    rvv::F32M2 v_ymax_b = rvv::LoadF32M2(soa_ymax + iou_idx, vl);
                    rvv::F32M2 v_xmax_b = rvv::LoadF32M2(soa_xmax + iou_idx, vl);
                    rvv::F32M2 v_area_b = rvv::LoadF32M2(soa_area + iou_idx, vl);

                    rvv::F32M2 v_overlap_ymax = rvv::MinF32ScalarM2(v_ymax_b, ymax_a, vl);
                    rvv::F32M2 v_overlap_ymin = rvv::MaxF32ScalarM2(v_ymin_b, ymin_a, vl);
                    rvv::F32M2 v_overlap_xmax = rvv::MinF32ScalarM2(v_xmax_b, xmax_a, vl);
                    rvv::F32M2 v_overlap_xmin = rvv::MaxF32ScalarM2(v_xmin_b, xmin_a, vl);

                    rvv::F32M2 v_overlap_h = rvv::SubF32M2(v_overlap_ymax, v_overlap_ymin, vl);
                    rvv::F32M2 v_overlap_w = rvv::SubF32M2(v_overlap_xmax, v_overlap_xmin, vl);

                    rvv::MaskF32M2 valid_h = rvv::MaskF32GreaterThanScalarM2(v_overlap_h, 0.0f, vl);
                    rvv::MaskF32M2 valid_w = rvv::MaskF32GreaterThanScalarM2(v_overlap_w, 0.0f, vl);
                    rvv::MaskF32M2 valid_overlap = rvv::AndMaskM2(valid_h, valid_w, vl);

                    rvv::F32M2 v_zero = rvv::SplatF32M2(0.0f, vl);
                    v_overlap_h = rvv::MergeF32M2(v_zero, v_overlap_h, valid_overlap, vl);
                    v_overlap_w = rvv::MergeF32M2(v_zero, v_overlap_w, valid_overlap, vl);

                    rvv::F32M2 v_intersection = rvv::MulF32M2(v_overlap_h, v_overlap_w, vl);

                    rvv::F32M2 v_union = rvv::AddF32ScalarM2(v_area_b, area_a, vl);
                    v_union = rvv::SubF32M2(v_union, v_intersection, vl);

                    rvv::F32M2 v_iou = rvv::DivF32M2(v_intersection, v_union, vl);

                    rvv::MaskF32M2 suppress_mask = rvv::MaskF32GreaterThanScalarM2(v_iou, iou_threshold, vl);

                    rvv::U8Mf2 v_one = rvv::SplatU8Mf2(1, vl);
                    rvv::StoreU8Mf2Masked(suppressed + iou_idx, v_one, suppress_mask, vl);

                    remain_iou -= vl;
                    iou_idx += vl;
                }
            }
        }
    }

    delete[] order;
    delete[] packed_scores;
    delete[] suppressed;
    delete[] soa_ymin;
    delete[] soa_xmin;
    delete[] soa_ymax;
    delete[] soa_xmax;
    delete[] soa_area;

    return output_count;
}