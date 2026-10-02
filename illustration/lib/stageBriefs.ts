import { fmtNum, fmtScore } from "./format";
import {
  applyScoreSuppression,
  sortCandidatesByScore,
} from "./nms";
import { WALKTHROUGH } from "./scenes";
import type { MemoryView, RegisterView } from "./vectorTrace";
import type { StageId } from "./walkthrough";

export type BriefKind = "contract" | "scalar" | "vector";

export type BriefGroup = {
  title: string;
  steps: string[];
};

export type BriefSlide = {
  id: string;
  kind: BriefKind;
  fn: string;
  watching: string;
  snippet: string;
  highlightLine: number;
  changed: string;
  flow?: string;
  steps: string[];
  groups?: BriefGroup[];
  memories: MemoryView[];
  registers: RegisterView[];
};

const VLMAX = 4;
const SCORES = WALKTHROUGH.scores[0];
const THRESHOLD = WALKTHROUGH.scoreThreshold;
const IOU = WALKTHROUGH.iouThreshold;
const MAX_PER_CLASS = WALKTHROUGH.maxOutputBoxesPerClass;

const FILTERED = applyScoreSuppression(SCORES, THRESHOLD);
const SORTED_ORDER = [...FILTERED.order];
const SORTED = sortCandidatesByScore(SORTED_ORDER, FILTERED.packedScores);

function mem(
  name: string,
  values: Array<string | number>,
  opts?: {
    hint?: string;
    label?: (index: number) => string;
    highlight?: number[];
    changed?: number[];
    role?: MemoryView["cells"][number]["role"];
  },
): MemoryView {
  return {
    name,
    hint: opts?.hint,
    cells: values.map((value, index) => ({
      index,
      label: opts?.label?.(index) ?? `[${index}]`,
      value: String(value),
      highlight: opts?.highlight?.includes(index),
      changed: opts?.changed?.includes(index),
      role: opts?.role,
    })),
  };
}

function lanes(
  values: Array<string | number | boolean>,
  opts?: { highlight?: number[]; vlmax?: number },
): NonNullable<RegisterView["lanes"]> {
  const vl = values.length;
  const vlmax = opts?.vlmax ?? VLMAX;
  const count = Math.max(vlmax, vl);
  return Array.from({ length: count }, (_, lane) => ({
    lane,
    value:
      lane < vl
        ? typeof values[lane] === "boolean"
          ? values[lane]
            ? "true"
            : "false"
          : String(values[lane])
        : "—",
    active: lane < vl,
    highlight: opts?.highlight?.includes(lane),
  }));
}

function vec(
  name: string,
  values: Array<string | number | boolean>,
  kind: RegisterView["kind"] = "vector",
  opts?: { highlight?: number[] },
): RegisterView {
  return {
    name,
    kind,
    lanes: lanes(values, opts),
  };
}

function inputsBrief(): BriefSlide[] {
  const boxCells = WALKTHROUGH.boxes.map((box) =>
    box.map((value) => fmtNum(value)).join(", "),
  );
  return [
    {
      id: "inputs-contract",
      kind: "contract",
      fn: "vec::NonMaxSuppression",
      watching:
        "One class, six boxes. The kernel keeps high-score boxes and drops later overlaps. This brief is the map; Scalar and Vector walk the same data one step at a time.",
      snippet: `int vec::NonMaxSuppression(
    boxes, scores, num_batches, num_classes, num_of_boxes,
    max_output_boxes_per_class, iou_threshold, score_threshold,
    selected_indices);`,
      highlightLine: 0,
      changed: "Output is rows of [batch, class, box_index], not the boxes themselves.",
      flow: "boxes + scores + thresholds → selected_indices",
      steps: [
        "Input: boxes, class scores, score threshold, IoU threshold, max per class.",
        "Output: packed [batch, class, box_index] rows, at most max_per_class per class.",
      ],
      memories: [
        mem("boxes", boxCells, {
          hint: "[y1, x1, y2, x2]",
          label: (i) => `box ${i}`,
        }),
        mem("class_scores", SCORES.map(fmtScore), {
          hint: "class 0 person",
          label: (i) => `box ${i}`,
        }),
        mem("thresholds", [
          `score ${fmtScore(THRESHOLD)}`,
          `IoU ${fmtScore(IOU)}`,
          `max_per_class ${MAX_PER_CLASS}`,
        ], { label: (i) => ["score", "iou", "cap"][i] }),
        mem("selected_indices", ["(empty)"], {
          hint: "goal: [batch, class, box]",
        }),
      ],
      registers: [],
    },
    {
      id: "inputs-scalar",
      kind: "scalar",
      fn: "ref::NonMaxSuppression",
      watching:
        "Scalar NMS is a per-class pipeline. Scratch arrays are allocated once; each class fills them, then the next class starts fresh.",
      snippet: `int* order = new int[num_of_boxes];
float* packed_scores = new float[num_of_boxes];
uint8_t* suppressed = new uint8_t[num_of_boxes];
for (int batch = 0; batch < num_batches; ++batch)
  for (int cls = 0; cls < num_classes; ++cls) {
    ApplyScoreSuppression(...);
    SortCandidatesByScore(...);
    // greedy IoU on suppressed[]
  }`,
      highlightLine: 4,
      changed: "Scratch lives for the whole call. One class at a time.",
      steps: [
        "Allocate order, packed_scores, and suppressed (one slot per box).",
        "For each (batch, class), point class_scores at that class row.",
        "Score filter packs survivors, sort ranks them, greedy IoU keeps a few.",
        "Write selected rows until the per-class cap. Then the next class.",
      ],
      memories: [
        mem("scratch", ["order", "packed_scores", "suppressed"], {
          hint: "one buffer per box count",
        }),
      ],
      registers: [],
    },
    {
      id: "inputs-vector",
      kind: "vector",
      fn: "vec::NonMaxSuppression · helpers",
      watching:
        "The outer batch and class loops stay scalar. Vectorization is the helpers. Each keep still writes one selected row, because that keep changes later alive flags.",
      snippet: `ApplyScoreSuppression(...);   // compress ids + scores
SortCandidatesByScore(...);   // compare-swap pairs
PackBoxesSoA(...);            // boxes[order[slot]] → four columns
rvv::FillU8(alive, 1, K);
while (...) {
  i = NextAliveIndex(...);    // vector scan
  write selected row;         // SCALAR
  SuppressOverlaps(...);      // vector IoU vs later slots
}`,
      highlightLine: 0,
      changed: "m4 for scores/order/sort/pack. m2 for alive/IoU. VL = min(remaining, VLMAX).",
      flow: "vl = min(remaining, teaching VLMAX = 4)",
      steps: [
        "Same (batch, class) loops as scalar — not vectorized.",
        "Inside each helper, SetVl asks for vl = min(remaining, VLMAX). Tails are shorter strips.",
        "Score filter, sort, and pack use e32m4 / vbool8.",
        "NextAliveIndex and SuppressOverlaps use e32m2 / vbool16 + u8mf2 so 8-bit alive flags share VL.",
        "The greedy keep (write selected_indices) stays a scalar store of one tuple.",
      ],
      memories: [
        mem("scratch (vector)", [
          "order",
          "packed_scores",
          "ymin",
          "xmin",
          "ymax",
          "xmax",
          "alive",
        ], { hint: "SoA columns appear after pack" }),
      ],
      registers: [
        vec(
          "active lanes (vl = 4)",
          [0, 1, 2, 3],
        ),
      ],
    },
  ];
}

function scoreBrief(): BriefSlide[] {
  const packedIds = FILTERED.order;
  const packedScores = FILTERED.packedScores.map(fmtScore);
  const stripScores = SCORES.slice(0, VLMAX).map(fmtScore);
  const keep = SCORES.slice(0, VLMAX).map((score) => !(score < THRESHOLD));
  const packedStripIds = [0, 1, 3];
  const packedStripScores = ["0.45", "0.55", "0.70"];

  return [
    {
      id: "score-contract",
      kind: "contract",
      fn: "ApplyScoreSuppression",
      watching:
        "Score filter drops boxes below the threshold and packs survivors into two dense arrays that share slots from here on.",
      snippet: `int ApplyScoreSuppression(
    class_scores, num_of_boxes, score_threshold,
    order, packed_scores);
// keep iff score >= *score_threshold
// K = how many ids (and scores) were written`,
      highlightLine: 3,
      changed: `K = ${packedIds.length}. Box 2 (score 0.20) never appears — the gap was mid-array.`,
      flow: "class_scores + score_threshold → order[], packed_scores[], K",
      steps: [
        "Input: class_scores[0 … num_of_boxes) and score_threshold.",
        "Output: order[i] = surviving box id, packed_scores[i] = that score, length K.",
        "order values are box indices, not slots. Later stages walk 0 … K-1 densely.",
      ],
      memories: [
        mem("class_scores", SCORES.map(fmtScore), {
          hint: "indexed by box",
          label: (i) => `box ${i}`,
          highlight: [2],
        }),
        mem("score_threshold", [fmtScore(THRESHOLD)], { label: () => "T" }),
        mem("order", packedIds.map((box) => `box ${box}`), {
          hint: `K = ${packedIds.length}`,
          changed: packedIds.map((_, i) => i),
        }),
        mem("packed_scores", packedScores, {
          hint: "same slots as order",
          changed: packedScores.map((_, i) => i),
        }),
      ],
      registers: [],
    },
    {
      id: "score-scalar",
      kind: "scalar",
      fn: "ref:: ApplyScoreSuppression",
      watching:
        "One box at a time. A miss leaves a hole in discovery order; packing writes only the hits, so order[] has no gaps.",
      snippet: `for (int box_index = 0; box_index < num_of_boxes; ++box_index) {
    if (score_threshold != nullptr &&
        class_scores[box_index] < *score_threshold) {
        continue;
    }
    packed_scores[candidate_count] = class_scores[box_index];
    order[candidate_count++] = box_index;
}`,
      highlightLine: 2,
      changed: "Drop is strict < . Equal to the threshold is kept.",
      steps: [
        "Loop box index 0 … num_of_boxes − 1 (discovery order).",
        "If class_scores[i] < score_threshold, skip that box.",
        "Otherwise write packed_scores[K] and order[K] = i, then K += 1.",
      ],
      memories: [
        mem("order after loop", packedIds.map((box) => `box ${box}`), {
          hint: "dense prefix",
        }),
        mem("packed_scores after loop", packedScores, {
          hint: "aligned with order",
        }),
      ],
      registers: [],
    },
    {
      id: "score-vector",
      kind: "vector",
      fn: "vec:: ApplyScoreSuppression",
      watching:
        "One strip of four scores from the six-box row. Compare in lanes, compress survivors to the front, then store only the kept prefix — not a masked store of VL lanes.",
      snippet: `const size_t vl = rvv::SetVlF32M4(remaining);
rvv::U32M4 indices = rvv::AddU32M4(rvv::IotaU32M4(vl), offset, vl);
rvv::F32M4 scores = rvv::LoadF32M4(class_scores + offset, vl);
rvv::MaskF32M4 keep =
    rvv::MaskF32GreaterEqualScalarM4(scores, *score_threshold, vl);
rvv::U32M4 packed_ids = rvv::CompressU32M4(indices, keep, vl);
rvv::F32M4 packed = rvv::CompressF32M4(scores, keep, vl);
const size_t kept = rvv::CountTrueF32M4(keep, vl);
rvv::StoreI32M4(order + candidate_count,
                rvv::BitcastU32ToI32M4(packed_ids), kept);
rvv::StoreF32M4(packed_scores + candidate_count, packed, kept);`,
      highlightLine: 3,
      changed: "Compress packs true lanes to the front. Store length is kept, not vl.",
      flow: "class_scores[0…3] → scores → keep → packed_ids / packed → order, packed_scores",
      steps: [
        "SetVlF32M4: this strip uses vl = min(6, 4) = 4. Boxes 4 and 5 wait for the tail strip.",
        "LoadF32M4: contiguous subset of class_scores. Legal because scores are dense in box order.",
        "IotaU32M4 + AddU32M4(offset): lane k is box offset+k, not a stored index array.",
        "MaskF32GreaterEqualScalarM4: keep[k] = scores[k] >= threshold.",
        "CompressU32M4 / CompressF32M4: surviving ids and scores slide to the front, same mask.",
        "CountTrueF32M4 then StoreI32M4 / StoreF32M4 of the kept prefix at candidate_count.",
      ],
      memories: [
        mem("class_scores", SCORES.map(fmtScore), {
          hint: "highlight = this strip",
          label: (i) => `box ${i}`,
          highlight: [0, 1, 2, 3],
        }),
        mem("order after this strip", packedStripIds.map((box) => `box ${box}`), {
          hint: "tail strip still to append",
          changed: [0, 1, 2],
        }),
      ],
      registers: [
        vec("scores", stripScores, "vector", { highlight: [2] }),
        vec("keep", keep, "mask"),
        vec("packed_ids", packedStripIds),
        vec("packed", packedStripScores),
        { name: "kept", kind: "scalar", scalar: "3" },
      ],
    },
  ];
}

function sortBrief(): BriefSlide[] {
  const beforeOrder = FILTERED.order;
  const beforeScores = FILTERED.packedScores.map(fmtScore);
  const afterOrder = SORTED_ORDER;
  const afterScores = SORTED.packedScores.map(fmtScore);
  const phase0 = SORTED.phases[0];
  const afterPhase0Scores = phase0.packedScores.map(fmtScore);
  const afterPhase0Order = phase0.order.map((box) => `box ${box}`);
  const leftScores = [beforeScores[0], beforeScores[2]];
  const rightScores = [beforeScores[1], beforeScores[3]];
  const shouldSwap = [true, true];
  const newLeftScores = leftScores.map((value, i) =>
    shouldSwap[i] ? rightScores[i] : value,
  );
  const newRightScores = rightScores.map((value, i) =>
    shouldSwap[i] ? leftScores[i] : value,
  );
  const swappedSlots = [0, 1, 2, 3];

  return [
    {
      id: "sort-contract",
      kind: "contract",
      fn: "SortCandidatesByScore",
      watching:
        "Sort reorders the packed arrays in place. Highest score first. Equal scores keep their relative order (stable, ONNX).",
      snippet: `void SortCandidatesByScore(int* order, float* packed_scores, int K);
// odd-even (brick) transposition sort
// swap iff left_score < right_score`,
      highlightLine: 0,
      changed: `order becomes [${afterOrder.join(", ")}]. packed_scores stay aligned with those slots.`,
      flow: "packed order + packed_scores → same arrays, descending by score",
      steps: [
        "Input: the K survivors from score filter, still in discovery order.",
        "Output: the same two arrays, sorted so packed_scores[0] is the best.",
        "Greedy will walk these slots from the front. It never re-reads class_scores.",
      ],
      memories: [
        mem("order (in)", beforeOrder.map((box) => `box ${box}`), {
          hint: "discovery order",
        }),
        mem("packed_scores (in)", beforeScores),
        mem("order (out)", afterOrder.map((box) => `box ${box}`), {
          hint: "highest first",
          changed: afterOrder.map((_, i) => i),
        }),
        mem("packed_scores (out)", afterScores, {
          changed: afterScores.map((_, i) => i),
        }),
      ],
      registers: [],
    },
    {
      id: "sort-scalar",
      kind: "scalar",
      fn: "ref:: CompareSwapPairs",
      watching:
        "K odd-even phases. Even phases pair (0,1)(2,3)…. Odd phases pair (1,2)(3,4)…. A leftover slot sits out that phase.",
      snippet: `if (candidate_count <= 1) return;
for (int phase = 0; phase < candidate_count; ++phase) {
    CompareSwapPairs(packed_scores, order, K, phase & 1);
}
// Swap iff left_score < right_score (ties do not swap)`,
      highlightLine: 2,
      changed: "Scores and box ids swap together so slot i always names one candidate.",
      steps: [
        "If K ≤ 1, nothing to sort.",
        "Run K phases. Phase p starts at slot (p & 1): even, then odd, then even…",
        "Each pair compares adjacent packed_scores. Swap both score and order if left < right.",
        "An unpaired leftover slot (odd K) is left untouched that phase.",
      ],
      memories: [
        mem("phase 0 pairs", ["(0,1)", "(2,3)", "slot 4 leftover"], {
          hint: "even alignment",
        }),
      ],
      registers: [],
    },
    {
      id: "sort-vector",
      kind: "vector",
      fn: "vec:: CompareSwapPairs",
      watching:
        "Each vector lane is one pair, not one element. A strided load picks every other score as left, the neighbor as right, then merge writes the swapped pair back.",
      snippet: `rvv::F32M4 left_score = rvv::LoadStridedF32M4(score_left, 2*sizeof(float), vl);
rvv::F32M4 right_score = rvv::LoadStridedF32M4(score_left + 1, stride, vl);
rvv::MaskF32M4 should_swap =
    rvv::MaskF32LessThanM4(left_score, right_score, vl);
rvv::F32M4 new_left = rvv::MergeF32M4(left_score, right_score, should_swap, vl);
rvv::I32M4 new_left_id = rvv::MergeI32M4(left_index, right_index, should_swap, vl);
rvv::StoreStridedF32M4(score_left, stride, new_left, vl);`,
      highlightLine: 2,
      changed:
        "After phase 0 store: packed_scores = [0.55, 0.45, 0.80, 0.70, 0.90]. Slots 0–3 swapped in pairs; slot 4 untouched.",
      flow: "strided left/right → mask < → merge scores and ids → strided store",
      steps: [
        "The phase loop stays scalar. Vector VL is pair_count, not K.",
        "LoadStridedF32M4 / LoadStridedI32M4: stride 2 elements, so each lane is a pair.",
        "MaskF32LessThanM4: should_swap when left_score < right_score (strict).",
        "MergeF32M4 and MergeI32M4 pick right into left (and vice versa) where the mask is true.",
        "StoreStrided writes both arrays. After this first iteration, packed_scores and order hold the swapped pairs.",
      ],
      memories: [
        mem("packed_scores (after phase 0)", afterPhase0Scores, {
          hint: "strided store result",
          changed: swappedSlots,
        }),
        mem("order (after phase 0)", afterPhase0Order, {
          hint: "ids follow the scores",
          changed: swappedSlots,
        }),
      ],
      registers: [
        vec("left_score", leftScores),
        vec("right_score", rightScores),
        vec("should_swap", shouldSwap, "mask"),
        vec("new_left_score", newLeftScores),
        vec("new_right_score", newRightScores),
      ],
    },
  ];
}

function greedyBrief(): BriefSlide[] {
  const order = SORTED_ORDER;
  const packed = SORTED.packedScores.map(fmtScore);
  const ymin = order.map((box) => fmtNum(WALKTHROUGH.boxes[box][0]));
  const alive = order.map(() => 1);

  return [
    {
      id: "greedy-contract",
      kind: "contract",
      fn: "greedy scan + IoU",
      watching:
        "Walk packed slots from the best score. Keep a box, then suppress later slots whose IoU is above the threshold. Stop at max_per_class.",
      snippet: `while (selected_for_class < max_per_class) {
    // next alive slot i
    selected_indices[row] = { batch, cls, order[i] };
    // suppress later slots with IoU > iou_threshold
}`,
      highlightLine: 2,
      changed: "This scene keeps box 5 then box 1. Cluster B dies after the first keep; cluster A yields box 1.",
      flow: "sorted order + boxes → selected_indices rows",
      steps: [
        "Input: sorted order[], packed_scores[], original boxes[], IoU threshold, max_per_class.",
        "Output: selected_indices rows [batch, class, box_index], at most two here.",
        "order[i] is the box id written to the row. Slots are 0-based in sorted order.",
      ],
      memories: [
        mem("order (sorted)", order.map((box) => `box ${box}`), {
          hint: "slot → box id",
        }),
        mem("packed_scores", packed, { hint: "already descending" }),
        mem("selected_indices", ["[0, 0, 5]", "[0, 0, 1]"], {
          hint: "[batch, class, box]",
          changed: [0, 1],
        }),
      ],
      registers: [],
    },
    {
      id: "greedy-scalar",
      kind: "scalar",
      fn: "ref:: greedy IoU",
      watching:
        "suppressed[] is a slot flag, not a box-id flag. Skip dead slots, keep one, then compare that box against every later slot.",
      snippet: `for (int i = 0; i < K; ++i) suppressed[i] = 0;
for (int i = 0; i < K && selected < max_per_class; ++i) {
    if (suppressed[i] != 0) continue;
    write selected row with order[i];
    for (int j = i + 1; j < K; ++j) {
        if (IoU(boxes[order[i]], boxes[order[j]]) > iou_threshold)
            suppressed[j] = 1;
    }
}`,
      highlightLine: 3,
      changed: "The inner IoU loop is later slots only. Earlier boxes already had their chance.",
      steps: [
        "Clear suppressed[0 … K) to 0 (alive).",
        "Walk slots in sorted order. If suppressed[i], skip.",
        "Keep: write [batch, class, order[i]] and count that keep toward the cap.",
        "Compare the kept box against later slots. If IoU > threshold, mark suppressed[j] = 1.",
        "Stop when the cap is hit or slots run out.",
      ],
      memories: [
        mem("suppressed (start)", order.map(() => 0), {
          hint: "0 = still in play",
        }),
      ],
      registers: [],
    },
    {
      id: "greedy-vector",
      kind: "vector",
      fn: "PackBoxesSoA + NextAliveIndex + SuppressOverlaps",
      watching:
        "Two vector stories, same as the Vector subtabs. First gather boxes[order[slot]] into four columns. Then scan alive flags and run the IoU formula in lanes against later slots. The keep itself is still one scalar row write.",
      snippet: `PackBoxesSoA(boxes, order, ymin, xmin, ymax, xmax, K);
rvv::FillU8(alive, 1, K);
i = NextAliveIndex(alive, i, K);          // FirstTrue on flags
row[2] = order[i];                        // SCALAR keep
SuppressOverlaps(..., i + 1, ..., iou);   // vector IoU, masked store 0`,
      highlightLine: 0,
      changed: "Columns make later-slot IoU a contiguous load. A contiguous load of boxes[] would be the wrong boxes.",
      flow: "order → gather SoA → FirstTrue → scalar keep → masked zero of overlapping alive[]",
      steps: [],
      groups: [
        {
          title: "Pack boxes (SoA)",
          steps: [
            "LoadI32M4 order[offset …] — box ids for this strip of slots.",
            "ShiftLeftU32M4 by 4: box id → byte offset into boxes[] (16 bytes per box).",
            "GatherF32M4 four times (ymin, xmin, ymax, xmax). Slot i of every column is box order[i].",
            "FillU8(alive, 1, K). Vector greedy uses alive[], not suppressed[].",
          ],
        },
        {
          title: "Scan + IoU",
          steps: [
            "NextAliveIndex: LoadU8Mf2 flags, MaskU8NotEqualScalarMf2, FirstTrueM2. Return the first live slot.",
            "Write selected_indices[row] = {batch, class, order[i]}. This store stays scalar.",
            "SuppressOverlaps: load later corners, then one IoU arithmetic block (min/max/sub/mul/add/div — scalar kept vs vector later).",
            "StoreU8Mf2Masked zeros alive[] where the candidate is still live and IoU > threshold.",
          ],
        },
      ],
      memories: [
        mem("order (sorted)", order.map((box) => `box ${box}`)),
        mem("ymin (after pack)", ymin, { hint: "slot-aligned column" }),
        mem("alive (start)", alive, { hint: "1 = still in play" }),
      ],
      registers: [
        vec("indices (first strip)", order.slice(0, VLMAX)),
      ],
    },
  ];
}

const BRIEFS: Record<StageId, BriefSlide[]> = {
  inputs: inputsBrief(),
  score: scoreBrief(),
  sort: sortBrief(),
  greedy: greedyBrief(),
};

export function stageBriefs(stage: StageId): BriefSlide[] {
  return BRIEFS[stage];
}
