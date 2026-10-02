import { fmtIou, fmtNum, fmtScore } from "./format";
import {
  applyScoreSuppression,
  nonMaxSuppression,
  selectedEquals,
  sortCandidatesByScore,
  type Box,
  type SelectedRow,
} from "./nms";
import { WALKTHROUGH } from "./scenes";
import {
  setTeachingVl,
  type TeachingVlmax,
} from "./walkthrough";

export type CellRole = "kept" | "compare" | "kill" | "dead";

export type Lane = {
  lane: number;
  value: string;
  active: boolean;
  highlight?: boolean;
  role?: CellRole;
};

export type MemoryCell = {
  index: number;
  label: string;
  value: string;
  highlight?: boolean;
  changed?: boolean;
  role?: CellRole;
};

export type RegisterView = {
  name: string;
  kind: "vector" | "mask" | "scalar";
  lanes?: Lane[];
  scalar?: string;
};

export type MemoryView = {
  name: string;
  hint?: string;
  cells: MemoryCell[];
};

export type VectorStep = {
  id: string;
  fn: string;
  helper: string;
  intrinsic: string;
  snippet: string;
  highlightLine: number;
  watching: string;
  whatItDoes: string;
  whyNeeded: string;
  laneRule: string;
  changed: string;
  sewmLmul: string;
  remaining: number;
  offset: number;
  vl: number;
  vlmax: number;
  strip: number;
  registers: RegisterView[];
  memories: MemoryView[];
  flow?: string;
  checkpoint?: { label: string; ok: boolean; detail: string };
};

export type VectorLessonId = "inputs" | "score" | "packing" | "sorting" | "greedy";

export type VectorTraceInput = {
  boxes: Box[];
  classScores: number[];
  scoreThreshold: number;
  iouThreshold: number;
  maxPerClass: number;
  vlmax: TeachingVlmax;
};

export type VectorLessonResult = {
  steps: VectorStep[];
  order: number[];
  packedScores: number[];
  ymin: number[];
  xmin: number[];
  ymax: number[];
  xmax: number[];
  alive: number[];
  selected: SelectedRow[];
};

const M4 = "e32m4 / vbool8";
const M2 = "e32m2 / vbool16 + u8mf2";

function walkthroughInput(vlmax: TeachingVlmax): VectorTraceInput {
  return {
    boxes: WALKTHROUGH.boxes,
    classScores: WALKTHROUGH.scores[0],
    scoreThreshold: WALKTHROUGH.scoreThreshold,
    iouThreshold: WALKTHROUGH.iouThreshold,
    maxPerClass: WALKTHROUGH.maxOutputBoxesPerClass,
    vlmax,
  };
}

function sameNums(a: number[], b: number[]): boolean {
  return (
    a.length === b.length &&
    a.every((value, index) => Math.abs(value - b[index]) < 1e-6)
  );
}

function lanesFrom(
  values: Array<string | number | boolean>,
  vl: number,
  vlmax: number,
  highlight?: number[],
  roles?: Array<CellRole | undefined>,
): Lane[] {
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
    highlight: highlight?.includes(lane),
    role: lane < vl ? roles?.[lane] : undefined,
  }));
}

function scoreLanes(values: number[], vl: number, vlmax: number): Lane[] {
  return lanesFrom(
    values.slice(0, vl).map((value) => fmtScore(value)),
    vl,
    vlmax,
  );
}

function cells(
  values: Array<string | number>,
  opts?: {
    highlight?: number[];
    changed?: number[];
    label?: (i: number) => string;
    role?: (i: number) => CellRole | undefined;
  },
): MemoryCell[] {
  return values.map((value, index) => ({
    index,
    label: opts?.label?.(index) ?? `[${index}]`,
    value: typeof value === "number" && !Number.isInteger(value) ? fmtNum(value) : String(value),
    highlight: opts?.highlight?.includes(index),
    changed: opts?.changed?.includes(index),
    role: opts?.role?.(index),
  }));
}

function orderCells(
  order: number[],
  highlight?: number[],
  changed?: number[],
  role?: (slot: number) => CellRole | undefined,
): MemoryCell[] {
  return order.map((box, slot) => ({
    index: slot,
    label: `[${slot}]`,
    value: `box ${box}`,
    highlight: highlight?.includes(slot),
    changed: changed?.includes(slot),
    role: role?.(slot),
  }));
}

function slotRole(
  slot: number,
  keptSlot: number,
  compareSlots: number[],
  killSlots: number[] = [],
  deadSlots: number[] = [],
): CellRole | undefined {
  if (killSlots.includes(slot)) {
    return "kill";
  }
  if (compareSlots.includes(slot)) {
    return "compare";
  }
  if (slot === keptSlot) {
    return "kept";
  }
  if (deadSlots.includes(slot)) {
    return "dead";
  }
  return undefined;
}

function deadSlotsOf(alive: number[]): number[] {
  return alive.flatMap((flag, slot) => (flag === 0 ? [slot] : []));
}

function pairMemories(
  order: number[],
  alive: number[],
  keptSlot: number,
  stripSlots: number[],
  killSlots: number[] = [],
): MemoryView[] {
  const deadSlots = deadSlotsOf(alive);
  const role = (slot: number) =>
    slotRole(slot, keptSlot, stripSlots, killSlots, deadSlots);
  return [
    {
      name: "order",
      hint: "slot → box · kept vs later candidates",
      cells: orderCells(order, stripSlots, killSlots, role),
    },
    {
      name: "alive",
      hint: "1 still in play",
      cells: cells(alive, {
        highlight: stripSlots,
        changed: killSlots,
        role,
      }),
    },
  ];
}

function scanMemories(
  order: number[],
  alive: number[],
  offset: number,
  vl: number,
  first: number,
): MemoryView[] {
  const scanSlots = Array.from({ length: vl }, (_, n) => offset + n);
  const firstSlot = first >= 0 ? offset + first : -1;
  const deadSlots = deadSlotsOf(alive);
  const role = (slot: number): CellRole | undefined => {
    if (firstSlot >= 0 && slot === firstSlot) {
      return "kept";
    }
    if (deadSlots.includes(slot)) {
      return "dead";
    }
    if (scanSlots.includes(slot)) {
      return "compare";
    }
    return undefined;
  };
  return [
    {
      name: "order",
      hint: "slot → box",
      cells: orderCells(
        order,
        scanSlots,
        firstSlot >= 0 ? [firstSlot] : [],
        role,
      ),
    },
    {
      name: "alive",
      hint: "scan this strip for the next 1",
      cells: cells(alive, { highlight: scanSlots, role }),
    },
  ];
}

function makeStep(
  draft: Omit<VectorStep, "highlightLine" | "registers" | "memories" | "remaining" | "offset" | "vl" | "vlmax" | "strip" | "sewmLmul"> &
    Partial<Pick<VectorStep, "highlightLine" | "registers" | "memories" | "remaining" | "offset" | "vl" | "vlmax" | "strip" | "sewmLmul">>,
): VectorStep {
  return {
    highlightLine: 0,
    registers: [],
    memories: [],
    remaining: 0,
    offset: 0,
    vl: 0,
    vlmax: 0,
    strip: 0,
    sewmLmul: M4,
    ...draft,
  };
}

function stripMeta(
  remaining: number,
  offset: number,
  vl: number,
  vlmax: number,
  strip: number,
) {
  return { remaining, offset, vl, vlmax, strip };
}

export function buildVectorLesson(
  lesson: VectorLessonId,
  input: VectorTraceInput = walkthroughInput(4),
): VectorLessonResult {
  if (lesson === "inputs") {
    return buildInputs(input);
  }
  if (lesson === "score") {
    return buildScoreFilter(input);
  }
  if (lesson === "packing") {
    return buildPacking(input);
  }
  if (lesson === "sorting") {
    return buildSorting(input);
  }
  return buildGreedy(input);
}

function emptyResult(steps: VectorStep[]): VectorLessonResult {
  return {
    steps,
    order: [],
    packedScores: [],
    ymin: [],
    xmin: [],
    ymax: [],
    xmax: [],
    alive: [],
    selected: [],
  };
}

function buildInputs(input: VectorTraceInput): VectorLessonResult {
  const { vlmax } = input;
  const steps: VectorStep[] = [
    makeStep({
      id: "inputs-scalar",
      fn: "vec::NonMaxSuppression",
      helper: "scalar loops + new[]",
      intrinsic: "(not an intrinsic)",
      snippet: `for (int batch = 0; batch < num_batches; ++batch)
  for (int cls = 0; cls < num_classes; ++cls) {
    // vector helpers below, one class at a time
  }`,
      watching:
        "The outer batch/class loops stay scalar. Work for one class is handed to vector helpers, then the next class starts fresh.",
      whatItDoes:
        "Walks every (batch, class) pair and points class_scores at that class row.",
      whyNeeded:
        "NMS is per-class. One class's alive flags and packed scores must not leak into the next class.",
      laneRule: "No lanes yet — this is one scalar iteration of the class loop (class 0 here).",
      changed: "Scratch pointers are allocated; total_selected = 0.",
      vlmax,
      memories: [
        {
          name: "scratch (allocated)",
          hint: "one buffer per box count",
          cells: cells(
            ["order", "packed_scores", "ymin", "xmin", "ymax", "xmax", "alive"],
            { label: (i) => String(i) },
          ),
        },
      ],
    }),
    makeStep({
      id: "inputs-vl",
      fn: "rvv::SetVlF32M4",
      helper: "SetVlF32M4",
      intrinsic: "__riscv_vsetvl_e32m4",
      snippet: `const size_t vl = rvv::SetVlF32M4(remaining);
// vl = min(remaining, VLMAX)  — VLMAX is hardware-dependent`,
      watching:
        "VLMAX is how many 32-bit lanes this configuration can hold. VL is how many this strip actually uses: min(remaining, VLMAX).",
      whatItDoes:
        "Asks the vector unit for a strip length. Teaching VLMAX here simulates hardware VLMAX so tails become visible.",
      whyNeeded:
        "Helpers strip-mine: while remaining > 0, set VL, process that many lanes, then remaining -= VL. SetVl is inside each helper, not once globally.",
      laneRule: `Lane 0 … VL-1 are active. Lanes VL … VLMAX-1 are tail (unused this strip). Teaching VLMAX = ${vlmax}.`,
      changed: `This session's teaching VLMAX = ${vlmax} (not the CPU's real VLMAX).`,
      vlmax,
      vl: vlmax,
      remaining: input.classScores.length,
      registers: [
        {
          name: `active lanes (vl = ${vlmax})`,
          kind: "vector",
          lanes: lanesFrom(
            Array.from({ length: vlmax }, (_, i) => i),
            vlmax,
            vlmax,
          ),
        },
      ],
    }),
    makeStep({
      id: "inputs-types",
      fn: "vec::NonMaxSuppression",
      helper: "LMUL groups",
      intrinsic: "vsetvl e32m4 vs e32m2",
      snippet: `// score filter, pack, compare-swap:  e32m4 / vbool8
// NextAliveIndex + SuppressOverlaps: e32m2 / vbool16 + u8mf2`,
      watching:
        "Filter, pack, and sort use wider LMUL=4 registers. Finding the next alive slot and IoU use LMUL=2 so the 8-bit alive flags share the same VL.",
      whatItDoes: "Picks a register group (SEW × LMUL) that matches the data being processed.",
      whyNeeded:
        "Alive flags are uint8. Pairing them with f32 IoU lanes needs a matching VL, which this kernel gets from e32m2 + u8mf2.",
      laneRule: "Same VL for a helper: every register in that strip has that many active lanes.",
      changed: "Remember: m4 for scores/order, m2 for alive/IoU.",
      sewmLmul: `${M4} then ${M2}`,
      vlmax,
    }),
    makeStep({
      id: "inputs-pipeline",
      fn: "vec::NonMaxSuppression",
      helper: "per-class pipeline",
      intrinsic: "(call sequence)",
      snippet: `ApplyScoreSuppression(...);   // compress ids + scores
SortCandidatesByScore(...);   // compare-swap
PackBoxesSoA(...);            // boxes[order[slot]] → four columns
rvv::FillU8(alive, 1, K);
while (...) {                 // one keep at a time
  i = NextAliveIndex(...);    // vector scan
  write selected row;         // SCALAR
  SuppressOverlaps(...);      // vector IoU vs later slots
}`,
      highlightLine: 0,
      watching:
        "Vectorization is the helpers. The greedy loop still writes one selected row at a time because each keep changes later alive flags.",
      whatItDoes:
        "Runs score filter (pack ids and scores) → sort → pack box corners into columns → fill alive → greedy scan/suppress for this class.",
      whyNeeded:
        "Each helper is lane-parallel. The keep decision is sequential, so it stays a scalar while-loop around vector scans.",
      laneRule: "Later stages show those helpers one intrinsic at a time.",
      changed: "Class 0 pipeline is what the Vector tabs walk.",
      vlmax,
      checkpoint: {
        label: "Pipeline map",
        ok: true,
        detail:
          "Scalar: class loop, selected-row write, i++, cap. Vector: filter+pack, sort, pack columns, fill alive, FirstTrue, IoU suppress.",
      },
    }),
  ];
  return emptyResult(steps);
}

function buildScoreFilter(input: VectorTraceInput): VectorLessonResult {
  const { classScores, scoreThreshold, vlmax } = input;
  const steps: VectorStep[] = [];
  const expected = applyScoreSuppression(classScores, scoreThreshold);
  const order: number[] = [];
  const packedScores: number[] = [];
  let remaining = classScores.length;
  let offset = 0;
  let strip = 0;
  let candidateCount = 0;

  steps.push(
    makeStep({
      id: "score-intro",
      fn: "ApplyScoreSuppression",
      helper: "strip-mined loop",
      intrinsic: "while (remaining > 0)",
      snippet: `int candidate_count = 0;
size_t remaining = num_of_boxes;
size_t offset = 0;
while (remaining > 0) {
    const size_t vl = rvv::SetVlF32M4(remaining);
    ...
}`,
      watching:
        "Score filter walks the whole class_scores row in strips. Dropped boxes leave gaps; compress closes those gaps into order[] and packed_scores[] together.",
      whatItDoes: `Keeps a box if score >= ${fmtScore(scoreThreshold)} (not strictly greater).`,
      whyNeeded:
        "A scalar for-loop would test one box. The vector path tests VL boxes, then packs surviving ids and scores to the front.",
      laneRule: "Box index for lane k this strip is offset + k.",
      changed: `num_of_boxes = ${classScores.length}. Survivors will collect in order[] and packed_scores[].`,
      ...stripMeta(remaining, offset, 0, vlmax, 0),
      memories: [
        {
          name: "class_scores",
          hint: "class 0, indexed by box",
          cells: cells(classScores.map(fmtScore), {
            label: (i) => `box ${i}`,
          }),
        },
        { name: "order", hint: "empty", cells: [] },
        { name: "packed_scores", hint: "empty", cells: [] },
      ],
    }),
  );

  while (remaining > 0) {
    const vl = setTeachingVl(remaining, vlmax);
    const meta = stripMeta(remaining, offset, vl, vlmax, strip);
    const iota = Array.from({ length: vl }, (_, i) => i);
    const indices = iota.map((i) => i + offset);
    const scores = classScores.slice(offset, offset + vl);
    const keep = scores.map((score) => !(score < scoreThreshold));
    const packed = indices.filter((_, i) => keep[i]);
    const packedScorePrefix = scores.filter((_, i) => keep[i]);
    const kept = packed.length;

    steps.push(
      makeStep({
        id: `score-${strip}-vl`,
        fn: "ApplyScoreSuppression",
        helper: "SetVlF32M4",
        intrinsic: "__riscv_vsetvl_e32m4",
        snippet: `const size_t vl = rvv::SetVlF32M4(remaining);
// __riscv_vsetvl_e32m4(remaining)`,
        watching: `Strip ${strip}: remaining = ${remaining}, so VL = min(${remaining}, ${vlmax}) = ${vl}.`,
        whatItDoes: "Chooses how many 32-bit lanes this iteration processes.",
        whyNeeded: "The tail strip is shorter than VLMAX whenever remaining < VLMAX.",
        laneRule: `Active lanes 0…${vl - 1}. ${vl < vlmax ? `Lanes ${vl}…${vlmax - 1} are tail.` : "This strip fills VLMAX."}`,
        changed: `vl = ${vl}`,
        ...meta,
        registers: [{ name: "vl", kind: "scalar", scalar: String(vl) }],
      }),
      makeStep({
        id: `score-${strip}-iota`,
        fn: "ApplyScoreSuppression",
        helper: "IotaU32M4",
        intrinsic: "__riscv_vid_v_u32m4",
        snippet: `rvv::U32M4 iota = rvv::IotaU32M4(vl);
// lane k ← k`,
        watching: "Iota writes 0, 1, 2, … into lanes. That is a relative index inside this strip, not a box id yet.",
        whatItDoes: "Fills each active lane with its own lane number.",
        whyNeeded: "We need box indices without a scalar loop. Iota is the strip-local index; the next add makes it absolute.",
        laneRule: "lane[k] = k",
        changed: `iota = [${iota.join(", ")}]`,
        ...meta,
        registers: [{ name: "iota", kind: "vector", lanes: lanesFrom(iota, vl, vlmax) }],
      }),
      makeStep({
        id: `score-${strip}-add`,
        fn: "ApplyScoreSuppression",
        helper: "AddU32M4",
        intrinsic: "__riscv_vadd_vx_u32m4",
        snippet: `rvv::U32M4 indices = rvv::AddU32M4(iota, offset, vl);
// box index = lane + strip offset`,
        watching: `Add the strip offset ${offset} so lane 0 means box ${offset}, not box 0.`,
        whatItDoes: "Turns strip-local iota into absolute box indices.",
        whyNeeded: "The second strip would otherwise reuse 0,1,2… and overwrite the wrong boxes.",
        laneRule: `lane[k] = ${offset} + k`,
        changed: `indices = [${indices.join(", ")}]`,
        ...meta,
        registers: [
          { name: "iota", kind: "vector", lanes: lanesFrom(iota, vl, vlmax) },
          { name: "indices", kind: "vector", lanes: lanesFrom(indices, vl, vlmax) },
        ],
        flow: `iota + ${offset} → indices`,
      }),
      makeStep({
        id: `score-${strip}-load`,
        fn: "ApplyScoreSuppression",
        helper: "LoadF32M4",
        intrinsic: "__riscv_vle32_v_f32m4",
        snippet: `rvv::F32M4 scores = rvv::LoadF32M4(class_scores + offset, vl);`,
        watching: "A contiguous load is legal here: class_scores is dense in box-index order.",
        whatItDoes: "Loads VL consecutive scores starting at offset.",
        whyNeeded: "The keep mask is computed from scores, not from indices.",
        laneRule: "lane[k] = class_scores[offset + k]",
        changed: `scores = [${scores.map(fmtScore).join(", ")}]`,
        ...meta,
        registers: [{ name: "scores", kind: "vector", lanes: scoreLanes(scores, vl, vlmax) }],
        memories: [
          {
            name: "class_scores",
            cells: cells(classScores.map(fmtScore), {
              label: (i) => `box ${i}`,
              highlight: indices,
            }),
          },
        ],
        flow: "class_scores[offset …] → scores",
      }),
      makeStep({
        id: `score-${strip}-mask`,
        fn: "ApplyScoreSuppression",
        helper: "MaskF32GreaterEqualScalarM4",
        intrinsic: "__riscv_vmfge_vf_f32m4_b8",
        snippet: `rvv::MaskF32M4 keep =
    rvv::MaskF32GreaterEqualScalarM4(scores, *score_threshold, vl);
// keep[k] = scores[k] >= threshold`,
        watching: `Threshold ${fmtScore(scoreThreshold)}. A box is dropped only if its score is strictly less.`,
        whatItDoes: "Builds a boolean mask, one bit per lane.",
        whyNeeded: "Compress reads this mask. There is no scalar if per box.",
        laneRule: `lane[k] = scores[k] >= ${fmtScore(scoreThreshold)}`,
        changed: `keep = [${keep.map((v) => (v ? "T" : "F")).join(", ")}]`,
        ...meta,
        registers: [
          { name: "scores", kind: "vector", lanes: scoreLanes(scores, vl, vlmax) },
          { name: "keep", kind: "mask", lanes: lanesFrom(keep, vl, vlmax) },
        ],
      }),
      makeStep({
        id: `score-${strip}-compress`,
        fn: "ApplyScoreSuppression",
        helper: "CompressU32M4",
        intrinsic: "__riscv_vcompress_vm_u32m4",
        snippet: `rvv::U32M4 packed_ids = rvv::CompressU32M4(indices, keep, vl);
// kept indices slide to the front; order preserved`,
        watching:
          "Compress packs true lanes to the front and leaves a gap-free prefix. That is how a mid-array drop (box 2) becomes a hole in order[], not a trailing skip.",
        whatItDoes: "Copies indices where keep is true, preserving their relative order.",
        whyNeeded: "Later stages walk order densely. They must not see dropped box ids.",
        laneRule: "packed_ids[0 … kept) = indices of true keep lanes, in order",
        changed: `packed_ids prefix = [${packed.join(", ")}]`,
        ...meta,
        registers: [
          { name: "indices", kind: "vector", lanes: lanesFrom(indices, vl, vlmax) },
          { name: "keep", kind: "mask", lanes: lanesFrom(keep, vl, vlmax) },
          {
            name: "packed_ids",
            kind: "vector",
            lanes: lanesFrom(packed, packed.length, vlmax),
          },
        ],
        flow: "indices + keep → packed_ids (front)",
      }),
      makeStep({
        id: `score-${strip}-compress-scores`,
        fn: "ApplyScoreSuppression",
        helper: "CompressF32M4",
        intrinsic: "__riscv_vcompress_vm_f32m4",
        snippet: `rvv::F32M4 packed = rvv::CompressF32M4(scores, keep, vl);
// same mask as packed_ids`,
        watching:
          "The scores that survived sit in registers already. Compress them with the same keep mask so packed_scores[i] lines up with order[i] — no later gather.",
        whatItDoes: "Copies scores where keep is true, preserving their relative order.",
        whyNeeded: "Sort compare-swaps a dense score row next to order. Gathering class_scores[order[i]] later would reload these values.",
        laneRule: "packed[0 … kept) = scores of true keep lanes, in order",
        changed: `packed prefix = [${packedScorePrefix.map(fmtScore).join(", ")}]`,
        ...meta,
        registers: [
          { name: "scores", kind: "vector", lanes: scoreLanes(scores, vl, vlmax) },
          { name: "keep", kind: "mask", lanes: lanesFrom(keep, vl, vlmax) },
          {
            name: "packed",
            kind: "vector",
            lanes: scoreLanes(packedScorePrefix, packedScorePrefix.length, vlmax),
          },
        ],
        flow: "scores + keep → packed (front)",
      }),
      makeStep({
        id: `score-${strip}-count`,
        fn: "ApplyScoreSuppression",
        helper: "CountTrueF32M4",
        intrinsic: "__riscv_vcpop_m_b8",
        snippet: `const size_t kept = rvv::CountTrueF32M4(keep, vl);`,
        watching: `Population count of the mask is ${kept} — that many values are stored, not VL.`,
        whatItDoes: "Counts true lanes so the store length is the compacted count.",
        whyNeeded: "Storing VL lanes would write garbage after the packed prefix.",
        laneRule: "kept = number of true bits in keep",
        changed: `kept = ${kept}`,
        ...meta,
        registers: [{ name: "kept", kind: "scalar", scalar: String(kept) }],
      }),
    );

    const destStart = candidateCount;
    const changedSlots = packed.map((_, i) => destStart + i);
    const nextOrder = [...order, ...packed];
    const nextPackedScores = [...packedScores, ...packedScorePrefix];
    if (kept > 0) {
      steps.push(
        makeStep({
          id: `score-${strip}-store`,
          fn: "ApplyScoreSuppression",
          helper: "StoreI32M4",
          intrinsic: "__riscv_vse32_v_i32m4",
          snippet: `rvv::StoreI32M4(order + candidate_count,
                rvv::BitcastU32ToI32M4(packed_ids), kept);`,
          watching: `Store ${kept} compacted box ids at order[${destStart}]. Bitcast is a same-bits view, not a numeric convert.`,
          whatItDoes: "Writes the packed id prefix into order[].",
          whyNeeded: "The next strip appends after these survivors.",
          laneRule: "store packed_ids[0…kept) as int32 box indices",
          changed: `order[${destStart} … ${destStart + kept}) = [${packed.join(", ")}]`,
          ...meta,
          memories: [
            {
              name: "order",
              hint: `K so far = ${nextOrder.length}`,
              cells: orderCells(nextOrder, packed, changedSlots),
            },
          ],
          flow: "packed_ids → order[candidate_count]",
        }),
        makeStep({
          id: `score-${strip}-store-scores`,
          fn: "ApplyScoreSuppression",
          helper: "StoreF32M4",
          intrinsic: "__riscv_vse32_v_f32m4",
          snippet: `rvv::StoreF32M4(packed_scores + candidate_count, packed, kept);`,
          watching: `Store the ${kept} compacted scores at packed_scores[${destStart}]. Same slots as the ids just written.`,
          whatItDoes: "Writes the packed score prefix into packed_scores[] and advances candidate_count by kept.",
          whyNeeded: "Sort swaps this row together with order. They must share slots from this pass on.",
          laneRule: "store packed[0…kept) as f32 scores",
          changed: `packed_scores[${destStart} … ${destStart + kept}) = [${packedScorePrefix.map(fmtScore).join(", ")}]`,
          ...meta,
          memories: [
            {
              name: "packed_scores",
              hint: `K so far = ${nextPackedScores.length}`,
              cells: cells(nextPackedScores.map(fmtScore), { changed: changedSlots }),
            },
            {
              name: "order",
              hint: `K so far = ${nextOrder.length}`,
              cells: orderCells(nextOrder, packed, changedSlots),
            },
          ],
          flow: "packed → packed_scores[candidate_count]",
        }),
      );
    }

    order.push(...packed);
    packedScores.push(...packedScorePrefix);
    candidateCount += kept;
    offset += vl;
    remaining -= vl;
    strip += 1;
  }

  const ok =
    sameNums(order, expected.order) && sameNums(packedScores, expected.packedScores);
  steps.push(
    makeStep({
      id: "score-done",
      fn: "ApplyScoreSuppression",
      helper: "return candidate_count",
      intrinsic: "(scalar return)",
      snippet: `return candidate_count;  // K = ${order.length}`,
      watching: `Done. order = [${order.join(", ")}], packed_scores = [${packedScores.map(fmtScore).join(", ")}]. Box 2 (score 0.20) never appears — the gap was mid-array.`,
      whatItDoes: "Returns how many box indices (and scores) were written.",
      whyNeeded: "Sort and greedy all use this K, not num_of_boxes.",
      laneRule: "slot i ↔ box order[i] ↔ score packed_scores[i]",
      changed: `K = ${order.length}`,
      vlmax: input.vlmax,
      memories: [
        { name: "order", hint: `K = ${order.length}`, cells: orderCells(order) },
        {
          name: "packed_scores",
          hint: "same slots as order",
          cells: cells(packedScores.map(fmtScore)),
        },
      ],
      checkpoint: {
        label: "Matches scalar ApplyScoreSuppression",
        ok,
        detail: ok
          ? `order = [${order.join(", ")}], packed = [${packedScores.map(fmtScore).join(", ")}]`
          : `vector order [${order.join(", ")}] vs scalar [${expected.order.join(", ")}]`,
      },
    }),
  );

  return {
    ...emptyResult(steps),
    order,
    packedScores,
  };
}

function buildPacking(input: VectorTraceInput): VectorLessonResult {
  const { boxes, vlmax } = input;
  const { order, packedScores } = applyScoreSuppression(
    input.classScores,
    input.scoreThreshold,
  );
  const steps: VectorStep[] = [];

  const sortedOrder = [...order];
  const { packedScores: sortedPacked } = sortCandidatesByScore(
    sortedOrder,
    packedScores,
  );
  const ymin = new Array<number>(sortedOrder.length).fill(Number.NaN);
  const xmin = new Array<number>(sortedOrder.length).fill(Number.NaN);
  const ymax = new Array<number>(sortedOrder.length).fill(Number.NaN);
  const xmax = new Array<number>(sortedOrder.length).fill(Number.NaN);

  steps.push(
    makeStep({
      id: "pack-soa-intro",
      fn: "PackBoxesSoA",
      helper: "structure of arrays",
      intrinsic: "(pack boxes[order[slot]])",
      snippet: `// SoA = structure of arrays: one column per corner, same slots as order[].
// boxes[] stores each box as four floats in a row: [y1, x1, y2, x2].
PackBoxesSoA(batch_boxes, order, ymin, xmin, ymax, xmax, K);
// ymin[i] = boxes[order[i]].y1   (and xmin, ymax, xmax the same way)`,
      watching:
        "SoA means structure of arrays. Instead of one [y1, x1, y2, x2] record per box, the kernel stores four columns ymin[], xmin[], ymax[], xmax[] aligned with order[]. Slot i of every column is box order[i]. Greedy IoU then loads later slots with a contiguous vector load.",
      whatItDoes: "Gathers boxes[order[slot]] into four dense corner arrays in sorted-candidate order.",
      whyNeeded:
        "Scalar IoU reads one candidate box at a time. Vector IoU needs VL later boxes at once. Columns make those loads dense. A contiguous load of boxes[] would be the wrong boxes, because slot 2 is box order[2], not box 2.",
      laneRule: `slot i → box order[i]. This scene: order = [${sortedOrder.join(", ")}].`,
      changed: `Sorted order = [${sortedOrder.join(", ")}]. Next: gather those boxes into columns.`,
      vlmax,
      memories: [
        {
          name: "boxes",
          hint: "one box = [y1, x1, y2, x2]",
          cells: cells(
            boxes.map((box) => box.map((v) => fmtNum(v)).join(", ")),
            { label: (i) => `box ${i}` },
          ),
        },
        {
          name: "order (sorted)",
          hint: "values are box ids",
          cells: orderCells(sortedOrder),
        },
      ],
    }),
  );

  let remaining = sortedOrder.length;
  let offset = 0;
  let strip = 0;
  while (remaining > 0) {
    const vl = setTeachingVl(remaining, vlmax);
    const meta = stripMeta(remaining, offset, vl, vlmax, strip);
    const indices = sortedOrder.slice(offset, offset + vl);
    const byteOffsets = indices.map((box) => box * 16);
    const y1 = indices.map((box) => boxes[box][0]);
    const x1 = indices.map((box) => boxes[box][1]);
    const y2 = indices.map((box) => boxes[box][2]);
    const x2 = indices.map((box) => boxes[box][3]);

    const showStrip = strip === 0;
    if (showStrip) {
      steps.push(
        makeStep({
          id: `soa-${strip}-load-order`,
          fn: "PackBoxesSoA",
          helper: "LoadI32M4",
          intrinsic: "__riscv_vle32_v_i32m4",
          snippet: `rvv::I32M4 indices = rvv::LoadI32M4(order + offset, vl);`,
          watching: `Load sorted box ids for slots ${offset}…${offset + vl - 1}: [${indices.join(", ")}]. These are the boxes whose corners go into this strip of the columns.`,
          whatItDoes: "Reads order[offset …] — the box ids for this strip.",
          whyNeeded: "Pack walks candidate slots, not box ids 0,1,2…. The gather uses these ids.",
          laneRule: "lane[k] = order[offset + k]",
          changed: `indices = [${indices.join(", ")}]`,
          ...meta,
          registers: [{ name: "indices", kind: "vector", lanes: lanesFrom(indices, vl, vlmax) }],
          memories: [
            {
              name: "order (sorted)",
              cells: orderCells(
                sortedOrder,
                Array.from({ length: vl }, (_, n) => offset + n),
              ),
            },
          ],
        }),
        makeStep({
          id: `soa-${strip}-shift`,
          fn: "PackBoxesSoA",
          helper: "ShiftLeftU32M4",
          intrinsic: "__riscv_vsll_vx_u32m4",
          snippet: `rvv::U32M4 byte_offsets =
    rvv::ShiftLeftU32M4(rvv::BitcastI32ToU32M4(indices), 4, vl);
// box_id << 4  ==  box_id * 16  (4 floats per box)`,
          watching: `Box ${indices[0]} starts at byte ${byteOffsets[0]} in boxes[]. Each box is four floats (16 bytes), so the shift is 4 bits.`,
          whatItDoes: "Converts box ids into byte offsets of the first corner (y1).",
          whyNeeded: "Gather reads bytes. Four floats per box means offset = box_id × 16.",
          laneRule: "lane[k] = box_id[k] × 16",
          changed: `byte_offsets = [${byteOffsets.join(", ")}]`,
          ...meta,
          registers: [
            { name: "indices", kind: "vector", lanes: lanesFrom(indices, vl, vlmax) },
            { name: "byte_offsets", kind: "vector", lanes: lanesFrom(byteOffsets, vl, vlmax) },
          ],
        }),
      );
    }

    const fields: Array<{
      name: "ymin" | "xmin" | "ymax" | "xmax";
      add: number;
      values: number[];
      corner: string;
    }> = [
      { name: "ymin", add: 0, values: y1, corner: "y1" },
      { name: "xmin", add: 4, values: x1, corner: "x1" },
      { name: "ymax", add: 8, values: y2, corner: "y2" },
      { name: "xmax", add: 12, values: x2, corner: "x2" },
    ];
    for (const field of fields) {
      if (!showStrip) {
        break;
      }
      const offs = byteOffsets.map((base) => base + field.add);
      const lastField = field.name === "xmax";
      const leftover = remaining - vl;
      steps.push(
        makeStep({
          id: `soa-${strip}-${field.name}`,
          fn: "PackBoxesSoA",
          helper: "GatherF32M4",
          intrinsic: "__riscv_vluxei32_v_f32m4",
          snippet: `rvv::StoreF32M4(${field.name} + offset,
    rvv::GatherF32M4(boxes, byte_offsets + ${field.add}, vl), vl);`,
          watching: lastField && leftover > 0
            ? `${field.name}: gather ${field.corner} of boxes [${indices.join(", ")}]. The leftover ${leftover} slot(s) use the same load → shift → gather with a smaller vl; we skip repeating that tail.`
            : `${field.name}: gather ${field.corner} of boxes [${indices.join(", ")}], then store a dense column so later IoU can LoadF32M2(${field.name} + start).`,
          whatItDoes: `Indexed-loads ${field.corner} for every lane and writes ${field.name}[offset+k].`,
          whyNeeded: `Scalar IoU reads BoxAt(..., order[j]).${field.corner}. The column is that value for every sorted slot.`,
          laneRule: `lane[k] = boxes[order[offset+k]].${field.corner}`,
          changed: lastField && leftover > 0
            ? `${field.name} written for this strip. Tail slots ${offset + vl}…${sortedOrder.length - 1} are the same loop, not shown.`
            : `${field.name} = [${field.values.map((v) => fmtNum(v)).join(", ")}]`,
          ...meta,
          registers: [
            { name: "offsets", kind: "vector", lanes: lanesFrom(offs, vl, vlmax) },
            {
              name: field.name,
              kind: "vector",
              lanes: lanesFrom(field.values.map((v) => fmtNum(v)), vl, vlmax),
            },
          ],
          flow: `boxes[*].${field.corner} → ${field.name}`,
        }),
      );
    }

    for (let i = 0; i < vl; i++) {
      const slot = offset + i;
      ymin[slot] = y1[i];
      xmin[slot] = x1[i];
      ymax[slot] = y2[i];
      xmax[slot] = x2[i];
    }
    offset += vl;
    remaining -= vl;
    strip += 1;
  }

  const alive = sortedOrder.map(() => 1);
  steps.push(
    makeStep({
      id: "pack-fill-alive",
      fn: "FillU8",
      helper: "FillU8",
      intrinsic: "__riscv_vmv_v_x_u8m4 + __riscv_vse8",
      snippet: `rvv::FillU8(alive, 1, candidate_count);
// wrapper strip-mines with e8m4 splat + store`,
      watching:
        "One illustrated strip is enough: leftover candidates repeat the same load → shift → gather with a smaller vl. alive[slot] uses the same slots as scalar suppressed[slot]. 1 means this candidate may still be kept (inverse of suppressed). Pack is done; Scan + IoU is the greedy loop.",
      whatItDoes: "Writes 1 into every candidate slot before greedy starts.",
      whyNeeded: "SuppressOverlaps later writes 0 onto overlapping later slots. Start from all-alive.",
      laneRule: "alive[slot] flags the sorted candidate. The box id is order[slot].",
      changed: `alive[0…${alive.length}) = 1`,
      sewmLmul: "e8m4",
      vlmax,
      memories: [
        { name: "order", hint: "slot → box", cells: orderCells(sortedOrder) },
        {
          name: "ymin",
          hint: "column, same slots as order",
          cells: cells(ymin.map((v) => fmtNum(v))),
        },
        {
          name: "alive",
          hint: "indexed by sorted slot",
          cells: cells(alive),
        },
      ],
      checkpoint: {
        label: "Columns + alive ready for greedy",
        ok: true,
        detail: `K = ${sortedOrder.length}, order = [${sortedOrder.join(", ")}]`,
      },
    }),
  );

  return {
    steps,
    order: sortedOrder,
    packedScores: sortedPacked,
    ymin,
    xmin,
    ymax,
    xmax,
    alive,
    selected: [],
  };
}

function buildSorting(input: VectorTraceInput): VectorLessonResult {
  const { classScores, vlmax } = input;
  const filtered = applyScoreSuppression(classScores, input.scoreThreshold);
  const order = [...filtered.order];
  const packedScores = [...filtered.packedScores];
  const expectedOrder = [...filtered.order];
  const { packedScores: expectedPacked, phases } = sortCandidatesByScore(
    expectedOrder,
    [...filtered.packedScores],
  );
  const steps: VectorStep[] = [];
  const k = order.length;

  steps.push(
    makeStep({
      id: "sort-intro",
      fn: "CompareSwapPairs",
      helper: "odd-even phases",
      intrinsic: "(scalar phase loop, vector pair strips)",
      snippet: `for (int phase = 0; phase < K; ++phase)
    CompareSwapPairs(packed_scores, order, K, phase & 1);
// even: pairs (0,1)(2,3)…   odd: pairs (1,2)(3,4)…
// each vector lane is one pair, not one element`,
      watching:
        "Lanes are independent pairs. Phase 0 loads every other score as left_score and the neighbor as right_score, then swaps both scores and box ids together.",
      whatItDoes: "Runs K odd-even phases. Swap iff left_score < right_score (strict, so ties stay stable).",
      whyNeeded: "Descending sort without a scalar inner loop over pairs. Equal scores must not swap (ONNX-stable).",
      laneRule: "lane p handles slots (start + 2p, start + 2p + 1).",
      changed: `K = ${k} phases. packed starts [${packedScores.map(fmtScore).join(", ")}].`,
      vlmax,
      memories: [
        { name: "order", cells: orderCells(order) },
        { name: "packed_scores", cells: cells(packedScores.map(fmtScore)) },
      ],
    }),
  );

  const liveOrder = [...order];
  const livePacked = [...packedScores];

  for (let phase = 0; phase < k; phase++) {
    const start = phase & 1;
    const pairCount = Math.floor((k - start) / 2);
    const leftover: number[] = [];
    for (let i = 0; i < k; i++) {
      if (i < start || (i - start) % 2 === 1 && i === start + 2 * pairCount) {
        leftover.push(i);
      }
    }
    for (let i = 0; i < k; i++) {
      const paired = i >= start && i < start + 2 * pairCount;
      if (!paired) leftover.push(i);
    }
    const leftoverUnique = [...new Set(leftover)].sort((a, b) => a - b);

    steps.push(
      makeStep({
        id: `sort-phase-${phase}-start`,
        fn: "CompareSwapPairs",
        helper: "phase start",
        intrinsic: "(scalar)",
        snippet: `const int start = phase & 1;  // ${start}
const int pair_count = (K - start) / 2;  // ${pairCount}`,
        watching: `Phase ${phase} (${start === 0 ? "even" : "odd"}): ${pairCount} pairs starting at slot ${start}. Unpaired leftover slot(s): [${leftoverUnique.join(", ") || "none"}].`,
        whatItDoes: "Selects even or odd pair alignment. Vector VL is pair_count, not K.",
        whyNeeded: "Mixing element-VL from pack with pair-VL here would process the wrong number of swaps.",
        laneRule: `Each lane is a pair. pair_count = ${pairCount}.`,
        changed: `start = ${start}, pair_count = ${pairCount}`,
        vlmax,
        remaining: pairCount,
        memories: [
          { name: "packed_scores", cells: cells(livePacked.map(fmtScore)) },
        ],
      }),
    );

    let remaining = pairCount;
    let pairIndex = 0;
    let strip = 0;
    while (remaining > 0) {
      const vl = setTeachingVl(remaining, vlmax);
      const meta = stripMeta(remaining, pairIndex, vl, vlmax, strip);
      const leftSlots = Array.from({ length: vl }, (_, p) => start + 2 * (pairIndex + p));
      const rightSlots = leftSlots.map((s) => s + 1);
      const leftScore = leftSlots.map((s) => livePacked[s]);
      const rightScore = rightSlots.map((s) => livePacked[s]);
      const leftIndex = leftSlots.map((s) => liveOrder[s]);
      const rightIndex = rightSlots.map((s) => liveOrder[s]);
      const shouldSwap = leftScore.map((value, i) => value < rightScore[i]);

      steps.push(
        makeStep({
          id: `sort-${phase}-s${strip}-left-score`,
          fn: "CompareSwapPairs",
          helper: "LoadStridedF32M4",
          intrinsic: "__riscv_vlse32_v_f32m4",
          snippet: `rvv::F32M4 left_score = rvv::LoadStridedF32M4(score_left, score_stride, vl);`,
          watching: `Stride 8 bytes: lane 0 reads slot ${leftSlots[0]}, lane 1 jumps to slot ${leftSlots[1] ?? "—"}. That skips the right neighbor, which is loaded separately.`,
          whatItDoes: "Loads the left score of each pair into consecutive lanes.",
          whyNeeded: "Pairs are not adjacent in lane space; they are adjacent in memory. Stride 2 gathers the evens (or odds).",
          laneRule: "lane[p] = packed_scores[start + 2*(pairIndex+p)]",
          changed: `left_score = [${leftScore.map(fmtScore).join(", ")}]`,
          ...meta,
          registers: [{ name: "left_score", kind: "vector", lanes: scoreLanes(leftScore, vl, vlmax) }],
          memories: [
            {
              name: "packed_scores",
              cells: cells(livePacked.map(fmtScore), { highlight: leftSlots }),
            },
          ],
          flow: "strided packed_scores → left_score",
        }),
        makeStep({
          id: `sort-${phase}-s${strip}-right-score`,
          fn: "CompareSwapPairs",
          helper: "LoadStridedF32M4",
          intrinsic: "__riscv_vlse32_v_f32m4",
          snippet: `rvv::F32M4 right_score = rvv::LoadStridedF32M4(score_left + 1, score_stride, vl);`,
          watching: "Same stride, starting one float later — the right_score of each pair.",
          whatItDoes: "Loads right-hand scores.",
          whyNeeded: "Compare needs both sides in register lanes that line up.",
          laneRule: "lane[p] = packed_scores[start + 2*(pairIndex+p) + 1]",
          changed: `right_score = [${rightScore.map(fmtScore).join(", ")}]`,
          ...meta,
          registers: [
            { name: "left_score", kind: "vector", lanes: scoreLanes(leftScore, vl, vlmax) },
            { name: "right_score", kind: "vector", lanes: scoreLanes(rightScore, vl, vlmax) },
          ],
        }),
        makeStep({
          id: `sort-${phase}-s${strip}-idx`,
          fn: "CompareSwapPairs",
          helper: "LoadStridedI32M4",
          intrinsic: "__riscv_vlse32_v_i32m4",
          snippet: `rvv::I32M4 left_index  = rvv::LoadStridedI32M4(index_left, index_stride, vl);
rvv::I32M4 right_index = rvv::LoadStridedI32M4(index_left + 1, index_stride, vl);`,
          highlightLine: 0,
          watching: "Box ids ride along. If scores swap, the matching order entries must swap too.",
          whatItDoes: "Loads left_index / right_index with the same pair stride.",
          whyNeeded: "Sorting packed_scores alone would desynchronize which box owns which score.",
          laneRule: "lane[p] holds order[slot] for that side of the pair",
          changed: `left_index [${leftIndex.join(", ")}], right_index [${rightIndex.join(", ")}]`,
          ...meta,
          registers: [
            { name: "left_index", kind: "vector", lanes: lanesFrom(leftIndex, vl, vlmax) },
            { name: "right_index", kind: "vector", lanes: lanesFrom(rightIndex, vl, vlmax) },
          ],
        }),
        makeStep({
          id: `sort-${phase}-s${strip}-mask`,
          fn: "CompareSwapPairs",
          helper: "MaskF32LessThanM4",
          intrinsic: "__riscv_vmflt_vv_f32m4_b8",
          snippet: `rvv::MaskF32M4 should_swap = rvv::MaskF32LessThanM4(left_score, right_score, vl);
// true iff left_score < right_score  (strict — equals stay)`,
          watching: shouldSwap.some(Boolean)
            ? `Strict <. True lanes swap because left_score < right_score. False lanes stay (including ties).`
            : `Strict <. Equal scores keep their order (stable). No pair in this strip has left_score < right_score, so the mask is all false.`,
          whatItDoes: "Compares pair scores lane-wise.",
          whyNeeded: "Merge uses this mask as the swap selector.",
          laneRule: "should_swap[p] = left_score[p] < right_score[p]",
          changed: `should_swap = [${shouldSwap.map((v) => (v ? "T" : "F")).join(", ")}]`,
          ...meta,
          registers: [
            { name: "left_score", kind: "vector", lanes: scoreLanes(leftScore, vl, vlmax) },
            { name: "right_score", kind: "vector", lanes: scoreLanes(rightScore, vl, vlmax) },
            { name: "should_swap", kind: "mask", lanes: lanesFrom(shouldSwap, vl, vlmax) },
          ],
        }),
        makeStep({
          id: `sort-${phase}-s${strip}-blend-score`,
          fn: "CompareSwapPairs",
          helper: "MergeF32M4",
          intrinsic: "__riscv_vmerge_vvm_f32m4",
          snippet: `new_left_score  = MergeF32M4(left_score,  right_score, should_swap, vl);
new_right_score = MergeF32M4(right_score, left_score,  should_swap, vl);
// lane = mask ? when_true : when_false`,
          watching: "Two merges cross the scores. True mask → left_score gets right_score and vice versa. False → both stay.",
          whatItDoes: "Selects swapped or original scores per lane.",
          whyNeeded: "There is no scalar if (swap) around each pair.",
          laneRule: "true → swap the pair; false → keep",
          changed: shouldSwap.some(Boolean) ? "at least one pair swaps scores" : "no score pair swaps this strip",
          ...meta,
          registers: [
            {
              name: "new_left_score",
              kind: "vector",
              lanes: scoreLanes(
                leftScore.map((value, i) => (shouldSwap[i] ? rightScore[i] : value)),
                vl,
                vlmax,
              ),
            },
            {
              name: "new_right_score",
              kind: "vector",
              lanes: scoreLanes(
                rightScore.map((value, i) => (shouldSwap[i] ? leftScore[i] : value)),
                vl,
                vlmax,
              ),
            },
          ],
        }),
        makeStep({
          id: `sort-${phase}-s${strip}-blend-idx`,
          fn: "CompareSwapPairs",
          helper: "MergeI32M4",
          intrinsic: "__riscv_vmerge_vvm_i32m4",
          snippet: `new_left_index  = MergeI32M4(left_index,  right_index, should_swap, vl);
new_right_index = MergeI32M4(right_index, left_index,  should_swap, vl);`,
          watching: "The same mask shuffles box ids so a score never changes owner.",
          whatItDoes: "Merges order entries with the score-swap mask.",
          whyNeeded: "Greedy later reads order[i] as the box id of packed_scores[i].",
          laneRule: "identical mask as the score merge",
          changed: "order lanes follow scores",
          ...meta,
          registers: [
            {
              name: "new_left_index",
              kind: "vector",
              lanes: lanesFrom(
                leftIndex.map((value, i) => (shouldSwap[i] ? rightIndex[i] : value)),
                vl,
                vlmax,
              ),
            },
            {
              name: "new_right_index",
              kind: "vector",
              lanes: lanesFrom(
                rightIndex.map((value, i) => (shouldSwap[i] ? leftIndex[i] : value)),
                vl,
                vlmax,
              ),
            },
          ],
        }),
      );

      const newLeftScore = leftScore.map((value, i) => (shouldSwap[i] ? rightScore[i] : value));
      const newRightScore = rightScore.map((value, i) => (shouldSwap[i] ? leftScore[i] : value));
      const newLeftIndex = leftIndex.map((value, i) => (shouldSwap[i] ? rightIndex[i] : value));
      const newRightIndex = rightIndex.map((value, i) => (shouldSwap[i] ? leftIndex[i] : value));
      leftSlots.forEach((slot, i) => {
        livePacked[slot] = newLeftScore[i];
        livePacked[slot + 1] = newRightScore[i];
        liveOrder[slot] = newLeftIndex[i];
        liveOrder[slot + 1] = newRightIndex[i];
      });

      steps.push(
        makeStep({
          id: `sort-${phase}-s${strip}-store`,
          fn: "CompareSwapPairs",
          helper: "StoreStridedF32M4 / StoreStridedI32M4",
          intrinsic: "__riscv_vsse32",
          snippet: `StoreStridedF32M4(score_left,     score_stride, new_left_score, vl);
StoreStridedF32M4(score_left + 1, score_stride, new_right_score, vl);
StoreStridedI32M4(index_left,     index_stride, new_left_index, vl);
StoreStridedI32M4(index_left + 1, index_stride, new_right_index, vl);`,
          watching: "Strided stores write the pairs back into the same slots they came from.",
          whatItDoes: "Commits the blended scores and box ids to memory.",
          whyNeeded: "The next phase reads the updated arrays.",
          laneRule: "same stride-2 pattern as the loads",
          changed: `packed = [${livePacked.map(fmtScore).join(", ")}]`,
          ...meta,
          memories: [
            {
              name: "packed_scores",
              cells: cells(livePacked.map(fmtScore), {
                changed: [...leftSlots, ...rightSlots],
              }),
            },
            {
              name: "order",
              cells: orderCells(liveOrder, undefined, [...leftSlots, ...rightSlots]),
            },
          ],
          flow: "new_left_score / new_right_score → packed_scores & order",
        }),
      );

      pairIndex += vl;
      remaining -= vl;
      strip += 1;
    }

    const scalarPhase = phases[phase];
    const phaseOk =
      sameNums(livePacked, scalarPhase.packedScores) &&
      sameNums(liveOrder, scalarPhase.order);
    steps.push(
      makeStep({
        id: `sort-phase-${phase}-done`,
        fn: "CompareSwapPairs",
        helper: `phase ${phase} done`,
        intrinsic: "(scalar phase++)",
        snippet: `// phase ${phase} of ${k} complete`,
        watching: `After phase ${phase}: order = [${liveOrder.join(", ")}].`,
        whatItDoes: "Advances to the next even/odd alignment.",
        whyNeeded: "K phases are sufficient for this odd-even sort.",
        laneRule: "Unpaired leftover slots were not touched.",
        changed: phaseOk ? "Matches scalar compareSwapPairs this phase." : "Phase mismatch vs scalar.",
        vlmax,
        checkpoint: {
          label: `Phase ${phase} vs scalar`,
          ok: phaseOk,
          detail: `order [${liveOrder.join(", ")}]`,
        },
        memories: [
          { name: "order", cells: orderCells(liveOrder) },
          { name: "packed_scores", cells: cells(livePacked.map(fmtScore)) },
        ],
      }),
    );
  }

  const ok = sameNums(liveOrder, expectedOrder) && sameNums(livePacked, expectedPacked);
  steps.push(
    makeStep({
      id: "sort-done",
      fn: "SortCandidatesByScore",
      helper: "K phases finished",
      intrinsic: "(return)",
      snippet: `// highest score first; ties kept stable`,
      watching: `Final order = [${liveOrder.join(", ")}], packed = [${livePacked.map(fmtScore).join(", ")}].`,
      whatItDoes: "Hands sorted candidates to packing and greedy.",
      whyNeeded: "Greedy must consider high score first.",
      laneRule: "slot 0 is the first keep candidate.",
      changed: ok ? "Matches scalar sortCandidatesByScore." : "Sort mismatch.",
      vlmax,
      checkpoint: {
        label: "Sort matches scalar",
        ok,
        detail: `order = [${liveOrder.join(", ")}]`,
      },
      memories: [
        { name: "order", cells: orderCells(liveOrder) },
        { name: "packed_scores", cells: cells(livePacked.map(fmtScore)) },
      ],
    }),
  );

  return {
    ...emptyResult(steps),
    order: liveOrder,
    packedScores: livePacked,
  };
}

function packSoA(boxes: Box[], order: number[]) {
  return {
    ymin: order.map((box) => boxes[box][0]),
    xmin: order.map((box) => boxes[box][1]),
    ymax: order.map((box) => boxes[box][2]),
    xmax: order.map((box) => boxes[box][3]),
  };
}

function firstTrue(mask: boolean[]): number {
  return mask.findIndex(Boolean);
}

function buildGreedy(input: VectorTraceInput): VectorLessonResult {
  const { boxes, classScores, iouThreshold, maxPerClass, vlmax } = input;
  const { order, packedScores } = applyScoreSuppression(
    classScores,
    input.scoreThreshold,
  );
  sortCandidatesByScore(order, packedScores);
  const soa = packSoA(boxes, order);
  const alive = order.map(() => 1);
  const selected: SelectedRow[] = [];
  const expected = nonMaxSuppression({
    boxes,
    scores: [classScores],
    maxOutputBoxesPerClass: maxPerClass,
    iouThreshold,
    scoreThreshold: input.scoreThreshold,
  });
  const steps: VectorStep[] = [];
  const k = order.length;

  steps.push(
    makeStep({
      id: "greedy-intro",
      fn: "vec::NonMaxSuppression",
      helper: "greedy after packing",
      intrinsic: "(NextAlive + scalar keep + SuppressOverlaps)",
      snippet: `// Same loop as scalar ref::, with slot flags (alive = !suppressed).
// Scalar IoU(kept, order[j]) is what SuppressOverlaps vectorizes.
while (selected_for_class < max_per_class) {
    i = NextAliveIndex(alive, i, K);     // skip dead slots
    if (i >= K) break;
    row[2] = order[i];                   // SCALAR keep
    SuppressOverlaps(..., i + 1, ...);   // vector IoU vs later slots
    i++;
}`,
      watching:
        `Packing is done: ymin/xmin/ymax/xmax and alive[] share slots with order = [${order.join(", ")}]. Greedy still keeps one box at a time. First alive slot is 0 → box ${order[0]}. Then SuppressOverlaps runs the scalar IoU formula on every later slot in vector lanes.`,
      whatItDoes: "Keeps up to max_per_class boxes, highest score first, suppressing later overlaps.",
      whyNeeded: "Each keep changes later alive flags, so the next keep cannot be chosen in parallel. Only the scan and the IoU strip are vectorized.",
      laneRule: "alive[slot] = 1 means order[slot] may still be kept. Slot is 0-based in sorted order.",
      changed: `max_per_class = ${maxPerClass}, K = ${k}, first keep candidate = box ${order[0]}`,
      sewmLmul: M2,
      vlmax,
      memories: [
        { name: "order", hint: "sorted slots", cells: orderCells(order) },
        {
          name: "ymin",
          hint: "packed column",
          cells: cells(soa.ymin.map((v) => fmtNum(v))),
        },
        { name: "alive", hint: "1 = still in play", cells: cells(alive) },
      ],
    }),
  );

  let i = 0;
  let selectedForClass = 0;
  let keepRound = 0;

  while (selectedForClass < maxPerClass) {
    const scanStart = i;
    let found = k;
    let remaining = k - scanStart;
    let offset = scanStart;
    let strip = 0;
    while (remaining > 0) {
      const vl = setTeachingVl(remaining, vlmax);
      const meta = { ...stripMeta(remaining, offset, vl, vlmax, strip), sewmLmul: M2 };
      const flags = alive.slice(offset, offset + vl);
      const isAlive = flags.map((flag) => flag !== 0);
      const first = firstTrue(isAlive);

      steps.push(
        makeStep({
          id: `next-${keepRound}-s${strip}-vl`,
          fn: "NextAliveIndex",
          helper: "SetVlF32M2",
          intrinsic: "__riscv_vsetvl_e32m2",
          snippet: `const size_t vl = rvv::SetVlF32M2(remaining);`,
          watching: `Scan for the next alive slot from ${scanStart}. Strip slots ${Array.from({ length: vl }, (_, n) => offset + n).join(", ")} (boxes ${Array.from({ length: vl }, (_, n) => order[offset + n]).join(", ")}), vl = ${vl}.`,
          whatItDoes: "Sets VL for the alive-flag strip (LMUL=2 so flags share this VL).",
          whyNeeded: "e32m2 VL matches u8mf2 flag loads.",
          laneRule: "lane k is sorted slot offset+k, box = order[offset+k]",
          changed: `vl = ${vl}`,
          ...meta,
        }),
        makeStep({
          id: `next-${keepRound}-s${strip}-load`,
          fn: "NextAliveIndex",
          helper: "LoadU8Mf2",
          intrinsic: "__riscv_vle8_v_u8mf2",
          snippet: `rvv::U8Mf2 flags = rvv::LoadU8Mf2(alive + offset, vl);`,
          watching: `Load alive flags for slots ${Array.from({ length: vl }, (_, n) => offset + n).join(", ")} (boxes ${Array.from({ length: vl }, (_, n) => order[offset + n]).join(", ")}). Dead slots are 0.`,
          whatItDoes: "Brings alive[offset …] into an 8-bit vector.",
          whyNeeded: "FirstTrue needs a mask derived from these flags.",
          laneRule: `lane[k] = alive[offset+k], box = order[offset+k]`,
          changed: `flags = [${flags.join(", ")}]`,
          ...meta,
          registers: [{ name: "flags", kind: "vector", lanes: lanesFrom(flags, vl, vlmax) }],
          memories: scanMemories(order, alive, offset, vl, first),
        }),
        makeStep({
          id: `next-${keepRound}-s${strip}-mask`,
          fn: "NextAliveIndex",
          helper: "MaskU8NotEqualScalarMf2",
          intrinsic: "__riscv_vmsne_vx_u8mf2_b16",
          snippet: `rvv::MaskF32M2 is_alive = rvv::MaskU8NotEqualScalarMf2(flags, 0, vl);`,
          watching: "Any nonzero flag is alive. This kernel stores 0 or 1, so this is flag != 0.",
          whatItDoes: "Turns bytes into a boolean mask.",
          whyNeeded: "vfirst wants a mask, not integers.",
          laneRule: "is_alive[k] = flags[k] != 0",
          changed: `is_alive = [${isAlive.map((v) => (v ? "T" : "F")).join(", ")}]`,
          ...meta,
          registers: [{ name: "is_alive", kind: "mask", lanes: lanesFrom(isAlive, vl, vlmax) }],
        }),
        makeStep({
          id: `next-${keepRound}-s${strip}-first`,
          fn: "NextAliveIndex",
          helper: "FirstTrueM2",
          intrinsic: "__riscv_vfirst_m_b16",
          snippet: `const int first = rvv::FirstTrueM2(is_alive, vl);
if (first >= 0) return offset + first;`,
          watching:
            first >= 0
              ? `First true lane is ${first} → slot ${offset + first} (box ${order[offset + first]}). Dead slots in this strip are skipped without a scalar inner loop.`
              : "No true lane in this strip — continue scanning.",
          whatItDoes: "Returns the lowest true lane index, or -1 if the strip is all false.",
          whyNeeded: "Scalar NMS would `continue` on suppressed[i]. Vector NMS jumps to the next alive slot.",
          laneRule: "result = offset + index of first true, or candidate_count if none",
          changed: first >= 0 ? `i = ${offset + first} (box ${order[offset + first]})` : "no hit this strip",
          ...meta,
          registers: [
            { name: "first", kind: "scalar", scalar: String(first) },
          ],
          memories: scanMemories(order, alive, offset, vl, first),
        }),
      );

      if (first >= 0) {
        found = offset + first;
        break;
      }
      offset += vl;
      remaining -= vl;
      strip += 1;
    }

    if (found >= k) {
      steps.push(
        makeStep({
          id: "greedy-none",
          fn: "vec::NonMaxSuppression",
          helper: "break",
          intrinsic: "(scalar)",
          snippet: `if (i >= candidate_count) break;`,
          watching: "No remaining alive candidate. The class is done.",
          whatItDoes: "Leaves the greedy loop.",
          whyNeeded: "K may run out before max_per_class.",
          laneRule: "—",
          changed: "break",
          sewmLmul: M2,
          vlmax,
        }),
      );
      break;
    }

    i = found;
    selected.push([0, 0, order[i]]);
    selectedForClass += 1;
    steps.push(
      makeStep({
        id: `keep-${keepRound}`,
        fn: "vec::NonMaxSuppression",
        helper: "write selected_indices",
        intrinsic: "(scalar store)",
        snippet: `row[0] = batch;
row[1] = cls;
row[2] = order[i];  // box ${order[i]}, slot ${i}`,
        watching: `SCALAR write: keep slot ${i} → box ${order[i]}. Next: SuppressOverlaps from slot ${i + 1} against later boxes ${order.slice(i + 1).join(", ") || "none"}.`,
        whatItDoes: "Appends [batch, class, box_index] using the box id from order[slot].",
        whyNeeded: "Output contract is one row per kept box, 0-based indices.",
        laneRule: "row[2] = order[i], never the slot itself if you need the original box id",
        changed: `selected row [${selected[selected.length - 1].join(", ")}]`,
        sewmLmul: M2,
        vlmax,
        memories: [
          ...pairMemories(
            order,
            alive,
            i,
            order.map((_, slot) => slot).filter((slot) => slot > i),
          ),
          {
            name: "selected_indices",
            hint: "[batch, class, box]",
            cells: selected.map((row, index) => ({
              index,
              label: `#${index}`,
              value: `[${row.join(", ")}]`,
              changed: index === selected.length - 1,
              role: index === selected.length - 1 ? "kept" : undefined,
            })),
          },
        ],
      }),
    );

    const keptYmin = soa.ymin[i];
    const keptXmin = soa.xmin[i];
    const keptYmax = soa.ymax[i];
    const keptXmax = soa.xmax[i];
    const areaKept = (keptYmax - keptYmin) * (keptXmax - keptXmin);
    const suppressStart = i + 1;

    remaining = k - suppressStart;
    offset = suppressStart;
    strip = 0;
    while (remaining > 0) {
      const vl = setTeachingVl(remaining, vlmax);
      const meta = { ...stripMeta(remaining, offset, vl, vlmax, strip), sewmLmul: M2 };
      const slots = Array.from({ length: vl }, (_, n) => offset + n);
      const candYmin = slots.map((s) => soa.ymin[s]);
      const candXmin = slots.map((s) => soa.xmin[s]);
      const candYmax = slots.map((s) => soa.ymax[s]);
      const candXmax = slots.map((s) => soa.xmax[s]);
      const interY = candYmax.map((ymax, n) =>
        Math.max(0, Math.min(ymax, keptYmax) - Math.max(candYmin[n], keptYmin)),
      );
      const interX = candXmax.map((xmax, n) =>
        Math.max(0, Math.min(xmax, keptXmax) - Math.max(candXmin[n], keptXmin)),
      );
      const intersection = interY.map((y, n) => y * interX[n]);
      const areaB = candYmax.map((ymax, n) => (ymax - candYmin[n]) * (candXmax[n] - candXmin[n]));
      const union = areaB.map((area, n) => area + areaKept - intersection[n]);
      const valid = areaB.map((area, n) => area > 0 && union[n] > 0);
      const iou = valid.map((okLane, n) => (okLane ? intersection[n] / union[n] : 0));
      const flags = slots.map((s) => alive[s]);
      const isAlive = flags.map((flag) => flag !== 0);
      const over = iou.map((value) => value > iouThreshold);
      const kill = isAlive.map((aliveLane, n) => aliveLane && over[n]);
      const killSlots = slots.filter((_, n) => kill[n]);
      const laterWatch = `Kept slot ${i} (box ${order[i]}) vs slots ${slots.join(", ")} (boxes ${slots.map((s) => order[s]).join(", ")}).`;
      const laneBoxes = slots
        .map((s, n) => `lane ${n} = box ${order[s]}`)
        .join(", ");
      const iouLabels = iou.map(
        (value, n) => `${fmtIou(value)} box ${order[slots[n]]}`,
      );
      const killRoles: Array<CellRole | undefined> = kill.map((bit) =>
        bit ? "kill" : "compare",
      );
      const stripMemories = pairMemories(order, alive, i, slots);
      const aliveAfter = alive.map((flag, index) =>
        killSlots.includes(index) ? 0 : flag,
      );

      steps.push(
        makeStep({
          id: `iou-${keepRound}-s${strip}-load`,
          fn: "SuppressOverlaps",
          helper: "LoadF32M2 × 4",
          intrinsic: "__riscv_vle32_v_f32m2",
          snippet: `cand_ymin = LoadF32M2(ymin + offset, vl);
cand_xmin = LoadF32M2(xmin + offset, vl);
cand_ymax = LoadF32M2(ymax + offset, vl);
cand_xmax = LoadF32M2(xmax + offset, vl);`,
          watching: `${laterWatch} Dense column loads — PackBoxesSoA already gathered boxes[order[slot]] so this is a contiguous load, not a gather.`,
          whatItDoes: "Loads later candidates' corners.",
          whyNeeded: "IoU arithmetic is lane-parallel over those candidates.",
          laneRule: laneBoxes,
          changed: `loaded ${vl} candidate boxes`,
          ...meta,
          registers: [
            { name: "cand_ymin", kind: "vector", lanes: lanesFrom(candYmin.map((v) => fmtNum(v)), vl, vlmax) },
            { name: "cand_xmax", kind: "vector", lanes: lanesFrom(candXmax.map((v) => fmtNum(v)), vl, vlmax) },
          ],
          memories: stripMemories,
        }),
        makeStep({
          id: `iou-${keepRound}-s${strip}-arith`,
          fn: "SuppressOverlaps",
          helper: "IoU arithmetic",
          intrinsic: "vfmin / vfmax / vfsub / vfmul / vfadd / vfdiv",
          snippet: `// Same IoU as the lab — one later box per lane.
// Mix of vector–vector and scalar–vector ops:
//   Min / Max / Sub     overlap
//   Mul                 intersection, area_b
//   Add(area_kept)      union   (scalar + every lane)
//   Div                 iou = intersection / union
iou = valid ? intersection / union : 0;`,
          watching: `${laterWatch} Skip the individual ops. Goal: IoU in every lane. The kept box (area ${fmtNum(areaKept)}) is a scalar broadcast into Min/Max/Add; later boxes stay vectors.`,
          whatItDoes: "Runs the scalar IoU formula in parallel with sub, mul, add, and div.",
          whyNeeded: "Students already computed IoU. Here the point is one kept box vs many later candidates, same formula per lane.",
          laneRule: `iou[k] = IoU(kept box ${order[i]}, ${laneBoxes})`,
          changed: `iou = [${iouLabels.join(", ")}]`,
          ...meta,
          registers: [
            {
              name: "iou",
              kind: "vector",
              lanes: lanesFrom(iouLabels, vl, vlmax, undefined, killRoles),
            },
          ],
          memories: stripMemories,
          flow: "scalar kept box + vector later boxes → iou[]",
        }),
        makeStep({
          id: `iou-${keepRound}-s${strip}-kill`,
          fn: "SuppressOverlaps",
          helper: "AndMaskM2",
          intrinsic: "__riscv_vmand_mm_b16",
          snippet: `kill = is_alive && (iou > iou_threshold);
// strict greater — IoU == 0.5 would live`,
          watching: `${laterWatch} Kill if still alive and IoU > ${fmtScore(iouThreshold)}. Already-dead lanes stay 0 and are not revived.`,
          whatItDoes: "Combines the overlap test with the alive mask.",
          whyNeeded: "Must not store over slots greedy already killed, and must not kill the kept slot (start is i+1).",
          laneRule: `${laneBoxes}. kill[k] = alive && iou[k] > ${fmtScore(iouThreshold)}`,
          changed: killSlots.length
            ? `kill boxes ${killSlots.map((slot) => order[slot]).join(", ")} (slots ${killSlots.join(", ")})`
            : "no lane killed",
          ...meta,
          registers: [
            {
              name: "iou",
              kind: "vector",
              lanes: lanesFrom(iouLabels, vl, vlmax, undefined, killRoles),
            },
            { name: "is_alive", kind: "mask", lanes: lanesFrom(isAlive, vl, vlmax) },
            {
              name: "kill",
              kind: "mask",
              lanes: lanesFrom(kill, vl, vlmax, undefined, killRoles),
            },
          ],
          memories: stripMemories,
        }),
        makeStep({
          id: `iou-${keepRound}-s${strip}-store`,
          fn: "SuppressOverlaps",
          helper: "StoreU8Mf2Masked",
          intrinsic: "__riscv_vse8_v_u8mf2_m",
          snippet: `StoreU8Mf2Masked(alive + offset, SplatU8Mf2(0), kill, vl);
// only kill-true lanes become 0`,
          watching: `${laterWatch} Masked store writes 0 onto killed slots and leaves other alive flags untouched.`,
          whatItDoes: "Clears alive where this keep overlaps a later candidate.",
          whyNeeded: "NextAliveIndex will skip those slots.",
          laneRule: "if kill[k] then alive[offset+k] = 0",
          changed: killSlots.length
            ? `cleared slots ${killSlots.join(", ")} (boxes ${killSlots.map((slot) => order[slot]).join(", ")})`
            : "no lane killed",
          ...meta,
          memories: pairMemories(order, aliveAfter, i, slots, killSlots),
          flow: "kill mask → masked store 0",
        }),
      );

      slots.forEach((slot, n) => {
        if (kill[n]) {
          alive[slot] = 0;
        }
      });
      offset += vl;
      remaining -= vl;
      strip += 1;
    }

    i += 1;
    keepRound += 1;
  }

  const ok = selectedEquals(selected, expected);
  steps.push(
    makeStep({
      id: "greedy-done",
      fn: "vec::NonMaxSuppression",
      helper: "return total_selected",
      intrinsic: "(scalar return)",
      snippet: `return total_selected;`,
      watching: `Class 0 kept ${selected.length} rows: boxes ${selected.map((row) => row[2]).join(" then ")}. Same boxes as scalar NMS; alive[slot] lines up with suppressed[slot].`,
      whatItDoes: "Returns how many [batch, class, box] rows were written.",
      whyNeeded: "Caller only sees selected_indices, not the scratch SoA.",
      laneRule: "Every index in the row is 0-based.",
      changed: `selected = ${selected.map((row) => `[${row.join(", ")}]`).join(" ")}`,
      sewmLmul: M2,
      vlmax,
      memories: [
        {
          name: "selected_indices",
          cells: selected.map((row, index) => ({
            index,
            label: `#${index}`,
            value: `[${row.join(", ")}]`,
            role: "kept" as const,
          })),
        },
        {
          name: "alive",
          cells: cells(alive, {
            role: (slot) => (alive[slot] === 0 ? "dead" : undefined),
          }),
        },
        {
          name: "order",
          cells: orderCells(order, undefined, undefined, (slot) =>
            selected.some((row) => row[2] === order[slot])
              ? "kept"
              : alive[slot] === 0
                ? "dead"
                : undefined,
          ),
        },
      ],
      checkpoint: {
        label: "Greedy matches scalar NMS",
        ok,
        detail: ok
          ? selected.map((row) => `[${row.join(", ")}]`).join(" ")
          : `vector ${JSON.stringify(selected)} vs scalar ${JSON.stringify(expected)}`,
      },
    }),
  );

  return {
    steps,
    order,
    packedScores,
    ...soa,
    alive,
    selected,
  };
}

export function verifyVectorTraces(): string[] {
  const errors: string[] = [];
  const vlmaxes: TeachingVlmax[] = [2, 4, 8];
  for (const vlmax of vlmaxes) {
    const input = walkthroughInput(vlmax);
    const expected = applyScoreSuppression(input.classScores, input.scoreThreshold);
    const expectedOrder = expected.order;
    const expectedPacked = expected.packedScores;
    const score = buildScoreFilter(input);
    if (!sameNums(score.order, expectedOrder)) {
      errors.push(`vlmax ${vlmax} score order ${score.order} != ${expectedOrder}`);
    }
    if (!sameNums(score.packedScores, expectedPacked)) {
      errors.push(`vlmax ${vlmax} score packed mismatch`);
    }
    const packing = buildPacking(input);
    const sorted = [...expectedOrder];
    const { packedScores: sortedPacked } = sortCandidatesByScore(
      sorted,
      [...expectedPacked],
    );
    if (!sameNums(packing.order, sorted) || !sameNums(packing.packedScores, sortedPacked)) {
      errors.push(`vlmax ${vlmax} soa pack mismatch`);
    }
    const sorting = buildSorting(input);
    if (!sameNums(sorting.order, sorted) || !sameNums(sorting.packedScores, sortedPacked)) {
      errors.push(`vlmax ${vlmax} sort mismatch`);
    }
    const greedy = buildGreedy(input);
    const expectedSelected = nonMaxSuppression({
      boxes: input.boxes,
      scores: [input.classScores],
      maxOutputBoxesPerClass: input.maxPerClass,
      iouThreshold: input.iouThreshold,
      scoreThreshold: input.scoreThreshold,
    });
    if (!selectedEquals(greedy.selected, expectedSelected)) {
      errors.push(
        `vlmax ${vlmax} selected ${JSON.stringify(greedy.selected)} != ${JSON.stringify(expectedSelected)}`,
      );
    }
    const firstBoxByte = expectedOrder[0] * 4;
    if (firstBoxByte !== 0) {
      errors.push("walkthrough order[0] is not box 0; pack offset story drifted");
    }
    const droppedMid = expectedOrder.includes(2);
    if (droppedMid) {
      errors.push("box 2 should be score-dropped so compress demonstrates a mid-array gap");
    }
  }
  return errors;
}

const VECTOR_TRACE_ERRORS = verifyVectorTraces();
if (VECTOR_TRACE_ERRORS.length > 0) {
  console.error("NMS vector-trace mismatch", VECTOR_TRACE_ERRORS);
}
