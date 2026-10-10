#include "NMS.hpp"

// ============================================================================
//  rvv::NonMaxSuppression  —  RVV version (ONNX NonMaxSuppression semantics)
//
//  Same signature and same output as ref::NonMaxSuppression (bit-exact indices).
//  VLEN-agnostic: every loop is strip-mined with vsetvl.
//  Rename the namespace to whatever your task's header declares.
//  If CenterPointBox is an `enum class`, write `CenterPointBox::Corners` below.
//
//  Toolchain: RVV intrinsics with the __riscv_ prefix. Segment-load tuple types
//  (vfloat32m1x4_t) need intrinsics v0.12+ (clang >= 17, GCC >= 14); older
//  compilers (e.g. GCC 13) fall back to 4 strided loads automatically.
// ============================================================================

#include <riscv_vector.h>
#include <cstdint>

namespace {

constexpr int RVV_MAX_BOXES = 4096; 

float bx_xmin[RVV_MAX_BOXES], bx_ymin[RVV_MAX_BOXES];
float bx_xmax[RVV_MAX_BOXES], bx_ymax[RVV_MAX_BOXES], bx_area[RVV_MAX_BOXES];


float s_xmin[RVV_MAX_BOXES], s_ymin[RVV_MAX_BOXES];
float s_xmax[RVV_MAX_BOXES], s_ymax[RVV_MAX_BOXES], s_area[RVV_MAX_BOXES];

int     candidates[RVV_MAX_BOXES];  
uint8_t removed[RVV_MAX_BOXES];      


inline bool rvv_comes_before(int a, int b, const float* s)
{
    return s[a] > s[b] || (s[a] == s[b] && a < b);
}

} 

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
    if (spatial_dim > RVV_MAX_BOXES) return -1;     
    if (max_output_boxes_per_class <= 0) return 0;

    const bool  has_thr = (score_threshold != nullptr);
    const float thr     = has_thr ? *score_threshold : 0.0f;

   
    const vuint8mf4_t ones = __riscv_vmv_v_x_u8mf4(1, __riscv_vsetvlmax_e8mf4());

    int num_selected = 0;

    for (int b = 0; b < num_batches; ++b) {

       
        const float* batch_boxes = boxes + b * spatial_dim * 4;
        for (int i = 0; i < spatial_dim; ) {
            size_t vl = __riscv_vsetvl_e32m1(spatial_dim - i);
#if __riscv_v_intrinsic >= 12000
            vfloat32m1x4_t t = __riscv_vlseg4e32_v_f32m1x4(batch_boxes + i * 4, vl);
            vfloat32m1_t f0 = __riscv_vget_v_f32m1x4_f32m1(t, 0);  
            vfloat32m1_t f1 = __riscv_vget_v_f32m1x4_f32m1(t, 1);  
            vfloat32m1_t f2 = __riscv_vget_v_f32m1x4_f32m1(t, 2);  
            vfloat32m1_t f3 = __riscv_vget_v_f32m1x4_f32m1(t, 3);   
#else
            const ptrdiff_t stride = 4 * sizeof(float);             
            vfloat32m1_t f0 = __riscv_vlse32_v_f32m1(batch_boxes + i * 4 + 0, stride, vl);
            vfloat32m1_t f1 = __riscv_vlse32_v_f32m1(batch_boxes + i * 4 + 1, stride, vl);
            vfloat32m1_t f2 = __riscv_vlse32_v_f32m1(batch_boxes + i * 4 + 2, stride, vl);
            vfloat32m1_t f3 = __riscv_vlse32_v_f32m1(batch_boxes + i * 4 + 3, stride, vl);
#endif
            vfloat32m1_t xmin, ymin, xmax, ymax;
            if (center_point_box == CenterPointBox::Corners) {                      
                ymin = __riscv_vfmin_vv_f32m1(f0, f2, vl);
                ymax = __riscv_vfmax_vv_f32m1(f0, f2, vl);
                xmin = __riscv_vfmin_vv_f32m1(f1, f3, vl);
                xmax = __riscv_vfmax_vv_f32m1(f1, f3, vl);
            } else {                                              
                vfloat32m1_t hw = __riscv_vfmul_vf_f32m1(f2, 0.5f, vl);
                vfloat32m1_t hh = __riscv_vfmul_vf_f32m1(f3, 0.5f, vl);
                xmin = __riscv_vfsub_vv_f32m1(f0, hw, vl);
                xmax = __riscv_vfadd_vv_f32m1(f0, hw, vl);
                ymin = __riscv_vfsub_vv_f32m1(f1, hh, vl);
                ymax = __riscv_vfadd_vv_f32m1(f1, hh, vl);
            }
            vfloat32m1_t area = __riscv_vfmul_vv_f32m1(__riscv_vfsub_vv_f32m1(xmax, xmin, vl),
                                                       __riscv_vfsub_vv_f32m1(ymax, ymin, vl), vl);
            __riscv_vse32_v_f32m1(bx_xmin + i, xmin, vl);
            __riscv_vse32_v_f32m1(bx_ymin + i, ymin, vl);
            __riscv_vse32_v_f32m1(bx_xmax + i, xmax, vl);
            __riscv_vse32_v_f32m1(bx_ymax + i, ymax, vl);
            __riscv_vse32_v_f32m1(bx_area + i, area, vl);
            i += (int)vl;
        }

        for (int c = 0; c < num_classes; ++c) {
            const float* class_scores = scores + (b * num_classes + c) * spatial_dim;

            // ==== Step 1: score filter -> candidates ====
            int num_cand = 0;
            if (!has_thr) {                                         // everything passes
                uint32_t* out = reinterpret_cast<uint32_t*>(candidates);
                for (int i = 0; i < spatial_dim; ) {
                    size_t vl = __riscv_vsetvl_e32m1(spatial_dim - i);
                    vuint32m1_t idx = __riscv_vadd_vx_u32m1(__riscv_vid_v_u32m1(vl), (uint32_t)i, vl);
                    __riscv_vse32_v_u32m1(out + i, idx, vl);
                    i += (int)vl;
                }
                num_cand = spatial_dim;
            } else {
                for (int i = 0; i < spatial_dim; ) {
                    size_t vl = __riscv_vsetvl_e32m1(spatial_dim - i);
                    vfloat32m1_t s = __riscv_vle32_v_f32m1(class_scores + i, vl);
                    vbool32_t pass = __riscv_vmfgt_vf_f32m1_b32(s, thr, vl);
                    vuint32m1_t idx = __riscv_vadd_vx_u32m1(__riscv_vid_v_u32m1(vl), (uint32_t)i, vl);
                    vuint32m1_t packed = __riscv_vcompress_vm_u32m1(idx, pass, vl);
                    size_t cnt = __riscv_vcpop_m_b32(pass, vl);
                    __riscv_vse32_v_u32m1(reinterpret_cast<uint32_t*>(candidates + num_cand), packed, cnt);
                    num_cand += (int)cnt;
                    i += (int)vl;
                }
            }

            if (num_cand <= 0) continue;                            // nothing passed the filter

            // ==== sort: scalar insertion sort for now (bitonic later) ====
            for (int i = 1; i < num_cand; ++i) {
                int key = candidates[i];
                int j = i - 1;
                while (j >= 0 && rvv_comes_before(key, candidates[j], class_scores)) {
                    candidates[j + 1] = candidates[j];
                    j--;
                }
                candidates[j + 1] = key;
            }

            // ==== gather SoA into sorted order (indexed loads, byte offsets) ====
            for (int k = 0; k < num_cand; ) {
                size_t vl = __riscv_vsetvl_e32m1(num_cand - k);
                vuint32m1_t id  = __riscv_vle32_v_u32m1(reinterpret_cast<const uint32_t*>(candidates + k), vl);
                vuint32m1_t off = __riscv_vsll_vx_u32m1(id, 2, vl);   // index * 4 bytes
                __riscv_vse32_v_f32m1(s_xmin + k, __riscv_vluxei32_v_f32m1(bx_xmin, off, vl), vl);
                __riscv_vse32_v_f32m1(s_ymin + k, __riscv_vluxei32_v_f32m1(bx_ymin, off, vl), vl);
                __riscv_vse32_v_f32m1(s_xmax + k, __riscv_vluxei32_v_f32m1(bx_xmax, off, vl), vl);
                __riscv_vse32_v_f32m1(s_ymax + k, __riscv_vluxei32_v_f32m1(bx_ymax, off, vl), vl);
                __riscv_vse32_v_f32m1(s_area + k, __riscv_vluxei32_v_f32m1(bx_area, off, vl), vl);
                k += (int)vl;
            }

            // ==== Step 3: greedy selection, forward suppression ====
                for (int k = 0; k < num_cand; ) {                       // removed[0..num_cand) = 0
                    size_t vl = __riscv_vsetvl_e8m1(num_cand - k);
                    __riscv_vse8_v_u8m1(removed + k, __riscv_vmv_v_x_u8m1(0, vl), vl);
                    k += (int)vl;
                }
            int num_kept = 0;
            for (int i = 0; i < num_cand; ++i) {
                if (removed[i]) continue;

                selected_indices[num_selected * 3 + 0] = b;
                selected_indices[num_selected * 3 + 1] = c;
                selected_indices[num_selected * 3 + 2] = candidates[i];
                num_selected++;
                if (++num_kept >= max_output_boxes_per_class) break;  

                const float ay1 = s_ymin[i], ax1 = s_xmin[i];
                const float ay2 = s_ymax[i], ax2 = s_xmax[i], aa = s_area[i];

                for (int j = i + 1; j < num_cand; ) {
                    size_t vl = __riscv_vsetvl_e32m1(num_cand - j);

                    // intersection: later start, earlier end
                    vfloat32m1_t yy1 = __riscv_vfmax_vf_f32m1(__riscv_vle32_v_f32m1(s_ymin + j, vl), ay1, vl);
                    vfloat32m1_t xx1 = __riscv_vfmax_vf_f32m1(__riscv_vle32_v_f32m1(s_xmin + j, vl), ax1, vl);
                    vfloat32m1_t yy2 = __riscv_vfmin_vf_f32m1(__riscv_vle32_v_f32m1(s_ymax + j, vl), ay2, vl);
                    vfloat32m1_t xx2 = __riscv_vfmin_vf_f32m1(__riscv_vle32_v_f32m1(s_xmax + j, vl), ax2, vl);

                    vfloat32m1_t w = __riscv_vfmax_vf_f32m1(__riscv_vfsub_vv_f32m1(xx2, xx1, vl), 0.0f, vl);
                    vfloat32m1_t h = __riscv_vfmax_vf_f32m1(__riscv_vfsub_vv_f32m1(yy2, yy1, vl), 0.0f, vl);
                    vfloat32m1_t inter = __riscv_vfmul_vv_f32m1(w, h, vl);

                   
                    vfloat32m1_t uni = __riscv_vfsub_vv_f32m1(
                        __riscv_vfadd_vf_f32m1(__riscv_vle32_v_f32m1(s_area + j, vl), aa, vl), inter, vl);
                    vfloat32m1_t iou = __riscv_vfdiv_vv_f32m1(inter, uni, vl);

                    vbool32_t bad = __riscv_vmfle_vf_f32m1_b32(uni, 0.0f, vl);
                    iou = __riscv_vfmerge_vfm_f32m1(iou, 0.0f, bad, vl);

                    vbool32_t sup = __riscv_vmfgt_vf_f32m1_b32(iou, iou_threshold, vl);
                    __riscv_vse8_v_u8mf4_m(sup, removed + j, ones, vl);   // set-only: never clears a flag

                    j += (int)vl;
                }
            }
        }
    }
    return num_selected;
}