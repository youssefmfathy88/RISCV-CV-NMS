export const FAMILIES = [
  { id: "vl", label: "VL" },
  { id: "memory", label: "Memory" },
  { id: "index", label: "Index" },
  { id: "mask", label: "Mask" },
  { id: "select", label: "Select" },
  { id: "broadcast", label: "Broadcast" },
  { id: "arithmetic", label: "Arithmetic" },
] as const;

export type FamilyId = (typeof FAMILIES)[number]["id"];

export type AnimKind =
  | "vl"
  | "load"
  | "store"
  | "stridedLoad"
  | "stridedStore"
  | "gather"
  | "maskedStore"
  | "bitcast"
  | "shift"
  | "iota"
  | "addScalar"
  | "compare"
  | "andMask"
  | "countTrue"
  | "firstTrue"
  | "compress"
  | "merge"
  | "splat"
  | "arith";

export type RegisterRole = "src" | "dst" | "mask" | "aux";

export type DemoRegister = {
  name: string;
  kind: "vector" | "mask" | "scalar";
  role: RegisterRole;
  before: string[];
  after: string[];
  scalarBefore?: string;
  scalarAfter?: string;
};

export type DemoMemoryCell = {
  index: number;
  label: string;
  before: string;
  after: string;
  hit?: boolean;
};

export type DemoMemory = {
  name: string;
  hint?: string;
  role: "src" | "dst";
  cells: DemoMemoryCell[];
};

export type IntrinsicSlide = {
  id: string;
  helper: string;
  intrinsic: string;
  family: FamilyId;
  anim: AnimKind;
  sewmLmul: string;
  usedIn: string[];
  also?: string[];
  watching: string;
  whatItDoes: string;
  laneRule: string;
  snippet: string;
  highlightLine: number;
  changed: string;
  flow?: string;
  vl: number;
  vlmax: number;
  remaining?: number;
  registers: DemoRegister[];
  memories: DemoMemory[];
};

const M4 = "e32m4 / vbool8";
const M2 = "e32m2 / vbool16";
const U8M4 = "e8m4";
const U8MF2 = "e8mf2 / vbool16";
const TAIL = "—";

const SCORE = "score filter";
const SORT = "odd-even pairs";
const PACK = "SoA pack";
const SCAN = "scan alive";
const IOU = "IoU suppress";
const FILL = "fill alive";

function pad(values: string[], vlmax = 4): string[] {
  const out = values.slice(0, vlmax);
  while (out.length < vlmax) {
    out.push(TAIL);
  }
  return out;
}

function vreg(
  name: string,
  kind: "vector" | "mask",
  role: RegisterRole,
  before: string[],
  after: string[] = before,
  vlmax = 4,
): DemoRegister {
  return {
    name,
    kind,
    role,
    before: pad(before, vlmax),
    after: pad(after, vlmax),
  };
}

function sreg(
  name: string,
  role: RegisterRole,
  before: string,
  after: string,
): DemoRegister {
  return {
    name,
    kind: "scalar",
    role,
    before: [],
    after: [],
    scalarBefore: before,
    scalarAfter: after,
  };
}

function mem(
  name: string,
  role: DemoMemory["role"],
  values: string[],
  after: string[] = values,
  hits?: number[],
  hint?: string,
): DemoMemory {
  const hitSet = new Set(hits ?? values.map((_, index) => index));
  return {
    name,
    hint,
    role,
    cells: values.map((value, index) => ({
      index,
      label: String(index),
      before: value,
      after: after[index] ?? value,
      hit: hitSet.has(index),
    })),
  };
}

function slide(
  draft: Omit<IntrinsicSlide, "vl" | "vlmax" | "highlightLine"> & {
    vl?: number;
    vlmax?: number;
    highlightLine?: number;
  },
): IntrinsicSlide {
  return {
    vl: 4,
    vlmax: 4,
    highlightLine: 0,
    ...draft,
  };
}

export const NMS_INTRINSICS: IntrinsicSlide[] = [
  slide({
    id: "SetVl",
    helper: "SetVl",
    intrinsic: "__riscv_vsetvl_e32m4",
    family: "vl",
    anim: "vl",
    sewmLmul: M4,
    usedIn: [SCORE, SORT, PACK, SCAN, IOU, FILL],
    also: ["SetVlF32M4", "SetVlF32M2", "SetVlU8M4"],
    watching:
      "Six scores remain. Teaching VLMAX is 4, so this strip takes vl = 4 and leaves two for the next strip.",
    whatItDoes: "Picks how many lanes this iteration processes.",
    laneRule: "vl = min(remaining, VLMAX). Tail lanes stay —.",
    snippet: `const size_t vl = rvv::SetVlF32M4(remaining);
// __riscv_vsetvl_e32m4
// same op: SetVlF32M2, SetVlU8M4`,
    changed: "vl = 4, remaining after this strip will be 2",
    remaining: 6,
    registers: [sreg("vl", "dst", "—", "4")],
    memories: [
      mem(
        "class_scores",
        "src",
        ["0.45", "0.55", "0.20", "0.70", "0.80", "0.90"],
        undefined,
        [0, 1, 2, 3],
        "this strip vs leftover",
      ),
    ],
  }),

  slide({
    id: "Load",
    helper: "Load",
    intrinsic: "__riscv_vle32_v_f32m4",
    family: "memory",
    anim: "load",
    sewmLmul: M4,
    usedIn: [SCORE, PACK, SCAN, IOU],
    also: ["LoadF32M4", "LoadI32M4", "LoadF32M2", "LoadU8Mf2"],
    watching:
      "Contiguous load. Lanes 0..3 copy class_scores[offset + lane] in order.",
    whatItDoes: "Reads consecutive values into a vector.",
    laneRule: "lane i ← memory[base + i]. No skipping.",
    snippet: `rvv::F32M4 scores = rvv::LoadF32M4(class_scores + offset, vl);
// __riscv_vle32_v_f32m4
// same op: LoadI32M4, LoadF32M2, LoadU8Mf2`,
    changed: "scores = [0.45, 0.55, 0.20, 0.70]",
    flow: "memory → register",
    registers: [
      vreg("scores", "vector", "dst", ["—", "—", "—", "—"], ["0.45", "0.55", "0.20", "0.70"]),
    ],
    memories: [
      mem("class_scores", "src", ["0.45", "0.55", "0.20", "0.70", "0.80", "0.90"], undefined, [0, 1, 2, 3]),
    ],
  }),
  slide({
    id: "Store",
    helper: "Store",
    intrinsic: "__riscv_vse32_v_f32m4",
    family: "memory",
    anim: "store",
    sewmLmul: M4,
    usedIn: [SCORE, PACK, FILL],
    also: ["StoreF32M4", "StoreI32M4", "StoreU8M4"],
    watching: "Write packed_scores[candidate_count + lane] from the register.",
    whatItDoes: "Stores consecutive lanes to memory.",
    laneRule: "memory[base + i] ← lane i. Only vl lanes.",
    snippet: `rvv::StoreF32M4(packed_scores + candidate_count, packed, kept);
// __riscv_vse32_v_f32m4
// same op: StoreI32M4, StoreU8M4`,
    changed: "packed_scores[0..2] = 0.45, 0.55, 0.70",
    flow: "register → memory",
    registers: [
      vreg("packed", "vector", "src", ["0.45", "0.55", "0.70", "—"]),
    ],
    memories: [
      mem(
        "packed_scores",
        "dst",
        ["—", "—", "—", "—", "—"],
        ["0.45", "0.55", "0.70", "—", "—"],
        [0, 1, 2],
      ),
    ],
  }),
  slide({
    id: "LoadStrided",
    helper: "LoadStrided",
    intrinsic: "__riscv_vlse32_v_f32m4",
    family: "memory",
    anim: "stridedLoad",
    sewmLmul: M4,
    usedIn: [SORT],
    also: ["LoadStridedF32M4", "LoadStridedI32M4"],
    watching:
      "Odd-even sort loads every other score. Stride is 8 bytes (two floats), so lanes are the left of each pair.",
    whatItDoes: "Load with a byte stride between consecutive lanes.",
    laneRule: "lane i ← memory[base + i * stride]. Skipped cells stay in memory.",
    snippet: `rvv::F32M4 left_score = rvv::LoadStridedF32M4(score_left, 2 * sizeof(float), vl);
// __riscv_vlse32_v_f32m4
// same op: LoadStridedI32M4`,
    changed: "left_score = [0.45, 0.20, 0.80, 0.55]",
    flow: "strided memory → register",
    registers: [
      vreg("left_score", "vector", "dst", ["—", "—", "—", "—"], ["0.45", "0.20", "0.80", "0.55"]),
    ],
    memories: [
      mem(
        "packed_scores",
        "src",
        ["0.45", "0.55", "0.20", "0.70", "0.80", "0.90", "0.55", "0.40"],
        undefined,
        [0, 2, 4, 6],
        "stride 8 bytes",
      ),
    ],
  }),
  slide({
    id: "StoreStrided",
    helper: "StoreStrided",
    intrinsic: "__riscv_vsse32_v_f32m4",
    family: "memory",
    anim: "stridedStore",
    sewmLmul: M4,
    usedIn: [SORT],
    also: ["StoreStridedF32M4", "StoreStridedI32M4"],
    watching: "Write the merged left scores back onto even slots. Odd slots wait for the other store.",
    whatItDoes: "Store with a byte stride between consecutive lanes.",
    laneRule: "memory[base + i * stride] ← lane i.",
    snippet: `rvv::StoreStridedF32M4(score_left, 2 * sizeof(float), new_left_score, vl);
// __riscv_vsse32_v_f32m4
// same op: StoreStridedI32M4`,
    changed: "even packed_scores slots become 0.55, 0.70, 0.90, 0.55",
    flow: "register → strided memory",
    registers: [vreg("new_left_score", "vector", "src", ["0.55", "0.70", "0.90", "0.55"])],
    memories: [
      mem(
        "packed_scores",
        "dst",
        ["0.45", "0.55", "0.20", "0.70", "0.80", "0.90", "0.55", "0.40"],
        ["0.55", "0.55", "0.70", "0.70", "0.90", "0.90", "0.55", "0.40"],
        [0, 2, 4, 6],
        "stride 8 bytes",
      ),
    ],
  }),
  slide({
    id: "Gather",
    helper: "Gather",
    intrinsic: "__riscv_vluxei32_v_f32m4",
    family: "memory",
    anim: "gather",
    sewmLmul: M4,
    usedIn: [PACK],
    also: ["GatherF32M4"],
    watching:
      "Indexed load. Lane i reads boxes at byte_offsets[i], so ymin of box 0, 1, 3, 4 land in dense SoA order.",
    whatItDoes: "Load from non-contiguous addresses using per-lane byte offsets.",
    laneRule: "lane i ← base[byte_offsets[i] / 4] as f32. Not a contiguous vle.",
    snippet: `rvv::F32M4 ymin = rvv::GatherF32M4(boxes, byte_offsets, vl);
// __riscv_vluxei32_v_f32m4`,
    changed: "ymin = [0, 0, 20, 20]",
    flow: "boxes[order[i]] → register",
    registers: [
      vreg("byte_offsets", "vector", "src", ["0", "16", "48", "64"]),
      vreg("ymin", "vector", "dst", ["—", "—", "—", "—"], ["0", "0", "20", "20"]),
    ],
    memories: [
      mem(
        "boxes.ymin",
        "src",
        ["0", "0", "0", "20", "20", "20"],
        undefined,
        [0, 1, 3, 4],
        "box ids 0..5",
      ),
    ],
  }),
  slide({
    id: "StoreMasked",
    helper: "StoreMasked",
    intrinsic: "__riscv_vse8_v_u8mf2_m",
    family: "memory",
    anim: "maskedStore",
    sewmLmul: U8MF2,
    usedIn: [IOU],
    also: ["StoreU8Mf2Masked"],
    watching:
      "Only kill-mask true lanes write 0 into alive[]. False lanes keep their old flag.",
    whatItDoes: "Masked store: write where the mask is true.",
    laneRule: "if mask[i] then alive[i] ← 0, else leave alive[i].",
    snippet: `rvv::StoreU8Mf2Masked(alive + offset, rvv::SplatU8Mf2(0, vl), kill, vl);
// __riscv_vse8_v_u8mf2_m`,
    changed: "alive[1] and alive[3] become 0",
    flow: "register → memory (masked)",
    registers: [
      vreg("zeros", "vector", "src", ["0", "0", "0", "0"]),
      vreg("kill", "mask", "mask", ["false", "true", "false", "true"]),
    ],
    memories: [
      mem("alive", "dst", ["1", "1", "1", "1"], ["1", "0", "1", "0"], [1, 3]),
    ],
  }),

  slide({
    id: "Iota",
    helper: "Iota",
    intrinsic: "__riscv_vid_v_u32m4",
    family: "index",
    anim: "iota",
    sewmLmul: M4,
    usedIn: [SCORE],
    also: ["IotaU32M4"],
    watching: "Lane i holds i. This is the box index inside the current strip, before adding offset.",
    whatItDoes: "Writes 0, 1, 2, … into the vector.",
    laneRule: "lane i ← i.",
    snippet: `rvv::U32M4 indices = rvv::IotaU32M4(vl);
// __riscv_vid_v_u32m4`,
    changed: "indices = [0, 1, 2, 3]",
    registers: [
      vreg("indices", "vector", "dst", ["—", "—", "—", "—"], ["0", "1", "2", "3"]),
    ],
    memories: [],
  }),
  slide({
    id: "AddU32",
    helper: "Add",
    intrinsic: "__riscv_vadd_vx_u32m4",
    family: "index",
    anim: "addScalar",
    sewmLmul: M4,
    usedIn: [SCORE, PACK],
    also: ["AddU32M4"],
    watching:
      "Add the strip offset so iota lanes become absolute box ids (or bump gather offsets by 4/8/12 bytes).",
    whatItDoes: "Adds a scalar to every active u32 lane.",
    laneRule: "lane i ← lane i + scalar.",
    snippet: `rvv::AddU32M4(rvv::IotaU32M4(vl), offset, vl);
// __riscv_vadd_vx_u32m4`,
    changed: "[0, 16, 48, 64] + 4 → [4, 20, 52, 68]",
    registers: [
      vreg("values", "vector", "src", ["0", "16", "48", "64"]),
      sreg("addend", "aux", "4", "4"),
      vreg("byte_offsets.xmin", "vector", "dst", ["0", "16", "48", "64"], ["4", "20", "52", "68"]),
    ],
    memories: [],
  }),
  slide({
    id: "ShiftLeft",
    helper: "ShiftLeft",
    intrinsic: "__riscv_vsll_vx_u32m4",
    family: "index",
    anim: "shift",
    sewmLmul: M4,
    usedIn: [PACK],
    also: ["ShiftLeftU32M4"],
    watching:
      "Box id 3 becomes byte offset 48 because each box is four f32s (16 bytes). Shift left 4 is ×16.",
    whatItDoes: "Logical left shift of each u32 lane.",
    laneRule: "lane i ← lane i << bits. bits=4 turns a box index into a byte offset.",
    snippet: `rvv::ShiftLeftU32M4(rvv::BitcastI32ToU32M4(indices), 4, vl);
// __riscv_vsll_vx_u32m4`,
    changed: "[0, 1, 3, 4] << 4 → [0, 16, 48, 64]",
    registers: [
      vreg("indices", "vector", "src", ["0", "1", "3", "4"]),
      sreg("bits", "aux", "4", "4"),
      vreg("byte_offsets", "vector", "dst", ["0", "1", "3", "4"], ["0", "16", "48", "64"]),
    ],
    memories: [],
  }),
  slide({
    id: "Bitcast",
    helper: "Bitcast",
    intrinsic: "__riscv_vreinterpret_v_i32m4_u32m4",
    family: "index",
    anim: "bitcast",
    sewmLmul: M4,
    usedIn: [SCORE, PACK],
    also: ["BitcastI32ToU32M4", "BitcastU32ToI32M4"],
    watching:
      "Same bits, new type. Shift and add want u32; order[] is stored as i32.",
    whatItDoes: "Reinterprets lanes as another integer type. No numeric conversion.",
    laneRule: "The pattern in each lane does not change.",
    snippet: `rvv::U32M4 raw = rvv::BitcastI32ToU32M4(indices);
// __riscv_vreinterpret_v_i32m4_u32m4
// same op: BitcastU32ToI32M4`,
    changed: "type i32 ↔ u32, values still [0, 1, 3, 4]",
    registers: [
      vreg("indices.i32", "vector", "src", ["0", "1", "3", "4"]),
      vreg("indices.u32", "vector", "dst", ["0", "1", "3", "4"], ["0", "1", "3", "4"]),
    ],
    memories: [],
  }),

  slide({
    id: "GreaterEqual",
    helper: "GreaterEqual",
    intrinsic: "__riscv_vmfge_vf_f32m4_b8",
    family: "mask",
    anim: "compare",
    sewmLmul: M4,
    usedIn: [SCORE],
    also: ["MaskF32GreaterEqualScalarM4"],
    watching:
      "Keep a box if score >= 0.40. Box 2 is 0.20, so that mask lane is false.",
    whatItDoes: "Per-lane compare against a scalar: values >= threshold.",
    laneRule: "mask[i] = (scores[i] >= 0.40). Strictly less drops.",
    snippet: `rvv::MaskF32M4 keep = rvv::MaskF32GreaterEqualScalarM4(scores, *score_threshold, vl);
// __riscv_vmfge_vf_f32m4_b8`,
    changed: "keep = [true, true, false, true]",
    registers: [
      vreg("scores", "vector", "src", ["0.45", "0.55", "0.20", "0.70"]),
      sreg("score_threshold", "aux", "0.40", "0.40"),
      vreg("keep", "mask", "dst", ["—", "—", "—", "—"], ["true", "true", "false", "true"]),
    ],
    memories: [],
  }),
  slide({
    id: "LessThan",
    helper: "LessThan",
    intrinsic: "__riscv_vmflt_vv_f32m4_b8",
    family: "mask",
    anim: "compare",
    sewmLmul: M4,
    usedIn: [SORT],
    also: ["MaskF32LessThanM4"],
    watching:
      "Swap a pair only if left_score < right_score. Equal scores stay (stable).",
    whatItDoes: "Per-lane compare of two vectors: left < right.",
    laneRule: "mask[i] = (left[i] < right[i]). Strict < keeps ties.",
    snippet: `rvv::MaskF32M4 should_swap = rvv::MaskF32LessThanM4(left_score, right_score, vl);
// __riscv_vmflt_vv_f32m4_b8`,
    changed: "should_swap = [true, true, false, false]",
    registers: [
      vreg("left_score", "vector", "src", ["0.45", "0.20", "0.90", "0.80"]),
      vreg("right_score", "vector", "src", ["0.55", "0.70", "0.80", "0.40"]),
      vreg("should_swap", "mask", "dst", ["—", "—", "—", "—"], ["true", "true", "false", "false"]),
    ],
    memories: [],
  }),
  slide({
    id: "GreaterThan",
    helper: "GreaterThan",
    intrinsic: "__riscv_vmfgt_vf_f32m2_b16",
    family: "mask",
    anim: "compare",
    sewmLmul: M2,
    usedIn: [IOU],
    also: ["MaskF32GreaterThanScalarM2"],
    watching:
      "Suppress if IoU is strictly greater than 0.50. Equal IoU would keep.",
    whatItDoes: "Per-lane compare against a scalar: values > threshold.",
    laneRule: "mask[i] = (iou[i] > 0.50).",
    snippet: `rvv::MaskF32GreaterThanScalarM2(iou, iou_threshold, vl);
// __riscv_vmfgt_vf_f32m2_b16`,
    changed: "over = [false, true, false, true]",
    registers: [
      vreg("iou", "vector", "src", ["0.25", "0.72", "0.00", "0.81"]),
      sreg("iou_threshold", "aux", "0.50", "0.50"),
      vreg("over", "mask", "dst", ["—", "—", "—", "—"], ["false", "true", "false", "true"]),
    ],
    memories: [],
  }),
  slide({
    id: "NotEqual",
    helper: "NotEqual",
    intrinsic: "__riscv_vmsne_vx_u8mf2_b16",
    family: "mask",
    anim: "compare",
    sewmLmul: U8MF2,
    usedIn: [SCAN, IOU],
    also: ["MaskU8NotEqualScalarMf2"],
    watching: "A live box is a flag not equal to 0. Zero already means suppressed.",
    whatItDoes: "Compare each lane to a scalar, true if not equal.",
    laneRule: "mask[i] = (flags[i] != 0).",
    snippet: `rvv::MaskF32M2 is_alive = rvv::MaskU8NotEqualScalarMf2(flags, 0, vl);
// __riscv_vmsne_vx_u8mf2_b16`,
    changed: "is_alive = [true, false, true, true]",
    registers: [
      vreg("flags", "vector", "src", ["1", "0", "1", "1"]),
      sreg("zero", "aux", "0", "0"),
      vreg("is_alive", "mask", "dst", ["—", "—", "—", "—"], ["true", "false", "true", "true"]),
    ],
    memories: [],
  }),
  slide({
    id: "AndMask",
    helper: "AndMask",
    intrinsic: "__riscv_vmand_mm_b16",
    family: "mask",
    anim: "andMask",
    sewmLmul: M2,
    usedIn: [IOU],
    also: ["AndMaskM2"],
    watching:
      "Kill only if the box is still alive and IoU is over the threshold. Dead boxes stay dead.",
    whatItDoes: "Bitwise AND of two masks.",
    laneRule: "out[i] = a[i] && b[i].",
    snippet: `rvv::MaskF32M2 kill = rvv::AndMaskM2(is_alive, over, vl);
// __riscv_vmand_mm_b16`,
    changed: "kill = [false, false, true, true]",
    registers: [
      vreg("is_alive", "mask", "src", ["true", "false", "true", "true"]),
      vreg("over", "mask", "src", ["false", "true", "true", "true"]),
      vreg("kill", "mask", "dst", ["—", "—", "—", "—"], ["false", "false", "true", "true"]),
    ],
    memories: [],
  }),
  slide({
    id: "CountTrue",
    helper: "CountTrue",
    intrinsic: "__riscv_vcpop_m_b8",
    family: "mask",
    anim: "countTrue",
    sewmLmul: M4,
    usedIn: [SCORE],
    also: ["CountTrueF32M4"],
    watching:
      "Three lanes survived the score test. That count is how many values the later store writes.",
    whatItDoes: "Counts true mask bits in the first vl lanes.",
    laneRule: "kept = popcount(mask[0..vl)).",
    snippet: `const size_t kept = rvv::CountTrueF32M4(keep, vl);
// __riscv_vcpop_m_b8`,
    changed: "kept = 3",
    registers: [
      vreg("keep", "mask", "src", ["true", "true", "false", "true"]),
      sreg("kept", "dst", "—", "3"),
    ],
    memories: [],
  }),
  slide({
    id: "FirstTrue",
    helper: "FirstTrue",
    intrinsic: "__riscv_vfirst_m_b16",
    family: "mask",
    anim: "firstTrue",
    sewmLmul: M2,
    usedIn: [SCAN],
    also: ["FirstTrueM2"],
    watching:
      "The next kept box is the first true alive lane. Here that is lane 2, so return offset+2. None true → -1.",
    whatItDoes: "Returns the index of the first true mask bit, or -1.",
    laneRule: "first = min { i | mask[i] }, else -1.",
    snippet: `const int first = rvv::FirstTrueM2(is_alive, vl);
// __riscv_vfirst_m_b16`,
    changed: "first = 2",
    registers: [
      vreg("is_alive", "mask", "src", ["false", "false", "true", "true"]),
      sreg("first", "dst", "—", "2"),
    ],
    memories: [],
  }),

  slide({
    id: "Merge",
    helper: "Merge",
    intrinsic: "__riscv_vmerge_vvm_f32m4",
    family: "select",
    anim: "merge",
    sewmLmul: M4,
    usedIn: [SORT, IOU],
    also: ["MergeF32M4", "MergeI32M4", "MergeF32M2"],
    watching:
      "Lane = mask ? when_true : when_false. True swap lanes take the other score. Blend is the same op.",
    whatItDoes: "Blends two vectors under a mask.",
    laneRule: "out[i] = mask[i] ? when_true[i] : when_false[i].",
    snippet: `rvv::MergeF32M4(left_score, right_score, should_swap, vl);
// __riscv_vmerge_vvm_f32m4
// same op: MergeI32M4, MergeF32M2`,
    changed: "new_left = [0.55, 0.70, 0.90, 0.80]",
    registers: [
      vreg("when_false", "vector", "src", ["0.45", "0.20", "0.90", "0.80"]),
      vreg("when_true", "vector", "src", ["0.55", "0.70", "0.80", "0.40"]),
      vreg("should_swap", "mask", "mask", ["true", "true", "false", "false"]),
      vreg("new_left", "vector", "dst", ["—", "—", "—", "—"], ["0.55", "0.70", "0.90", "0.80"]),
    ],
    memories: [],
  }),
  slide({
    id: "Compress",
    helper: "Compress",
    intrinsic: "__riscv_vcompress_vm_f32m4",
    family: "select",
    anim: "compress",
    sewmLmul: M4,
    usedIn: [SCORE],
    also: ["CompressF32M4", "CompressU32M4"],
    watching:
      "Pack kept scores to the front. Lane 2 (0.20) drops; 0.45, 0.55, 0.70 slide left.",
    whatItDoes: "Packs lanes where the mask is true, preserving order.",
    laneRule: "kept lanes gather left. Dropped lanes become tail —.",
    snippet: `rvv::F32M4 packed = rvv::CompressF32M4(scores, keep, vl);
// __riscv_vcompress_vm_f32m4
// same op: CompressU32M4`,
    changed: "packed = [0.45, 0.55, 0.70, —]",
    registers: [
      vreg("scores", "vector", "src", ["0.45", "0.55", "0.20", "0.70"]),
      vreg("keep", "mask", "mask", ["true", "true", "false", "true"]),
      vreg("packed", "vector", "dst", ["0.45", "0.55", "0.20", "0.70"], ["0.45", "0.55", "0.70", "—"]),
    ],
    memories: [],
  }),

  slide({
    id: "Splat",
    helper: "Splat",
    intrinsic: "__riscv_vmv_v_x_u8m4",
    family: "broadcast",
    anim: "splat",
    sewmLmul: U8M4,
    usedIn: [FILL, IOU],
    also: ["SplatU8M4", "SplatU8Mf2", "SplatF32M2"],
    watching: "Broadcast 1 into every active lane, then store into alive[].",
    whatItDoes: "Copies a scalar into all active lanes.",
    laneRule: "lane i ← value.",
    snippet: `rvv::SplatU8M4(1, vl);
// __riscv_vmv_v_x_u8m4
// same op: SplatU8Mf2, SplatF32M2`,
    changed: "ones = [1, 1, 1, 1]",
    registers: [
      sreg("value", "src", "1", "1"),
      vreg("ones", "vector", "dst", ["—", "—", "—", "—"], ["1", "1", "1", "1"]),
    ],
    memories: [],
  }),

  slide({
    id: "Min",
    helper: "Min",
    intrinsic: "__riscv_vfmin_vf_f32m2",
    family: "arithmetic",
    anim: "arith",
    sewmLmul: M2,
    usedIn: [IOU],
    also: ["MinF32ScalarM2"],
    watching: "Intersection ymax is min(cand_ymax, kept_ymax) per lane.",
    whatItDoes: "Per-lane minimum of a vector and a scalar.",
    laneRule: "out[i] = min(values[i], scalar).",
    snippet: `rvv::MinF32ScalarM2(cand_ymax, kept_ymax, vl);
// __riscv_vfmin_vf_f32m2`,
    changed: "min_ymax = [4, 4, 4, 4]",
    registers: [
      vreg("cand_ymax", "vector", "src", ["4", "4", "5", "24"]),
      sreg("kept_ymax", "aux", "4", "4"),
      vreg("min_ymax", "vector", "dst", ["—", "—", "—", "—"], ["4", "4", "4", "4"]),
    ],
    memories: [],
  }),
  slide({
    id: "Max",
    helper: "Max",
    intrinsic: "__riscv_vfmax_vf_f32m2",
    family: "arithmetic",
    anim: "arith",
    sewmLmul: M2,
    usedIn: [IOU],
    also: ["MaxF32ScalarM2"],
    watching: "Clamp a negative overlap to 0, or take max(cand_ymin, kept_ymin).",
    whatItDoes: "Per-lane maximum of a vector and a scalar.",
    laneRule: "out[i] = max(values[i], scalar).",
    snippet: `rvv::MaxF32ScalarM2(inter_h, 0.0f, vl);
// __riscv_vfmax_vf_f32m2`,
    changed: "inter_h = [0, 3, 0, 2]",
    registers: [
      vreg("raw", "vector", "src", ["-1", "3", "0", "2"]),
      sreg("zero", "aux", "0", "0"),
      vreg("inter_h", "vector", "dst", ["—", "—", "—", "—"], ["0", "3", "0", "2"]),
    ],
    memories: [],
  }),
  slide({
    id: "Sub",
    helper: "Sub",
    intrinsic: "__riscv_vfsub_vv_f32m2",
    family: "arithmetic",
    anim: "arith",
    sewmLmul: M2,
    usedIn: [IOU],
    also: ["SubF32M2"],
    watching: "Height of the overlap is min_ymax − max_ymin, done in every lane.",
    whatItDoes: "Per-lane subtraction of two vectors.",
    laneRule: "out[i] = left[i] − right[i].",
    snippet: `rvv::SubF32M2(min_ymax, max_ymin, vl);
// __riscv_vfsub_vv_f32m2`,
    changed: "inter_h = [4, 3, 0, 4]",
    registers: [
      vreg("left", "vector", "src", ["4", "4", "5", "24"]),
      vreg("right", "vector", "src", ["0", "1", "5", "20"]),
      vreg("diff", "vector", "dst", ["—", "—", "—", "—"], ["4", "3", "0", "4"]),
    ],
    memories: [],
  }),
  slide({
    id: "Mul",
    helper: "Mul",
    intrinsic: "__riscv_vfmul_vv_f32m2",
    family: "arithmetic",
    anim: "arith",
    sewmLmul: M2,
    usedIn: [IOU],
    also: ["MulF32M2"],
    watching: "Intersection area is inter_y × inter_x in every lane at once.",
    whatItDoes: "Per-lane multiplication of two vectors.",
    laneRule: "out[i] = left[i] × right[i].",
    snippet: `rvv::MulF32M2(inter_y, inter_x, vl);
// __riscv_vfmul_vv_f32m2`,
    changed: "intersection = [16, 9, 0, 16]",
    registers: [
      vreg("inter_y", "vector", "src", ["4", "3", "0", "4"]),
      vreg("inter_x", "vector", "src", ["4", "3", "2", "4"]),
      vreg("intersection", "vector", "dst", ["—", "—", "—", "—"], ["16", "9", "0", "16"]),
    ],
    memories: [],
  }),
  slide({
    id: "AddF32",
    helper: "Add",
    intrinsic: "__riscv_vfadd_vf_f32m2",
    family: "arithmetic",
    anim: "arith",
    sewmLmul: M2,
    usedIn: [IOU],
    also: ["AddF32ScalarM2"],
    watching: "area_b + area_kept in every lane. Union subtracts the intersection next.",
    whatItDoes: "Adds a scalar to every f32 lane.",
    laneRule: "out[i] = values[i] + scalar.",
    snippet: `rvv::AddF32ScalarM2(area_b, area_kept, vl);
// __riscv_vfadd_vf_f32m2`,
    changed: "sum = [32, 25, 16, 32]",
    registers: [
      vreg("area_b", "vector", "src", ["16", "9", "0", "16"]),
      sreg("area_kept", "aux", "16", "16"),
      vreg("sum", "vector", "dst", ["—", "—", "—", "—"], ["32", "25", "16", "32"]),
    ],
    memories: [],
  }),
  slide({
    id: "Div",
    helper: "Div",
    intrinsic: "__riscv_vfdiv_vv_f32m2",
    family: "arithmetic",
    anim: "arith",
    sewmLmul: M2,
    usedIn: [IOU],
    also: ["DivF32M2"],
    watching: "IoU = intersection / union, per lane. Merge later zeros invalid unions.",
    whatItDoes: "Per-lane division of two vectors.",
    laneRule: "out[i] = numer[i] / denom[i].",
    snippet: `rvv::DivF32M2(intersection, union_area, vl);
// __riscv_vfdiv_vv_f32m2`,
    changed: "quot = [0.50, 0.36, 0, 0.50]",
    registers: [
      vreg("intersection", "vector", "src", ["16", "9", "0", "16"]),
      vreg("union_area", "vector", "src", ["32", "25", "16", "32"]),
      vreg("quot", "vector", "dst", ["—", "—", "—", "—"], ["0.50", "0.36", "0", "0.50"]),
    ],
    memories: [],
  }),
];

export function slidesForFamily(family: FamilyId): IntrinsicSlide[] {
  return NMS_INTRINSICS.filter((item) => item.family === family);
}
