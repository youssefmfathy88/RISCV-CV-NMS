import { fmtIou, fmtScore } from "./format";
import {
  compareSwapPairs,
  iouBreakdown,
  unpairedIndices,
  type Box,
  type IoUBreakdown,
  type SelectedRow,
  type SwapPair,
} from "./nms";

export type TraceKind =
  | "entry"
  | "score-filter"
  | "pack"
  | "sort-phase"
  | "clear-suppressed"
  | "consider-skip"
  | "keep"
  | "iou-compare"
  | "class-cap"
  | "class-done"
  | "summary"
  | "done";

export type PipelineSummaryStep = {
  title: string;
  detail: string;
};

export const NMS_PIPELINE_SUMMARY: PipelineSummaryStep[] = [
  {
    title: "Score suppression",
    detail:
      "Drop boxes whose class score is below score_threshold. Survivors are packed into order[] with matching packed_scores[].",
  },
  {
    title: "Sort",
    detail:
      "Odd-even compare-swap phases sort candidates by score, highest first. order[] holds box ids; scores live in packed_scores[].",
  },
  {
    title: "IoU suppression",
    detail:
      "Walk sorted order greedily: keep a box, then suppress later boxes when IoU is strictly greater than iou_threshold.",
  },
];

export type NmsSnapshot = {
  cls: number | null;
  order: number[];
  candidateCount: number;
  packedScores: number[];
  suppressed: number[];
  selected: SelectedRow[];
  selectedForClass: number;
  highlightBoxes: number[];
  currentBox: number | null;
  keptBox: number | null;
  compareBox: number | null;
};

export type ScoreFilterExtra = {
  boxIndex: number;
  score: number;
  passed: boolean;
};

export type SortPhaseExtra = {
  phase: number;
  start: number;
  label: "even" | "odd";
  pairs: SwapPair[];
  leftover: number[];
};

export type IouCompareExtra = {
  kept: number;
  other: number;
  keptSlot: number;
  otherSlot: number;
  breakdown: IoUBreakdown | null;
  didSuppress: boolean;
  alreadySuppressed: boolean;
};

export type TraceStep = {
  kind: TraceKind;
  fn: string;
  title: string;
  explanation: string;
  snippet: string;
  snapshot: NmsSnapshot;
  extra?: ScoreFilterExtra | SortPhaseExtra | IouCompareExtra;
  quiz?: { prompt: string; correct: "keep" | "drop"; box: number };
};

export type TraceInput = {
  boxes: Box[];
  scores: number[][];
  maxOutputBoxesPerClass: number;
  iouThreshold: number;
  scoreThreshold: number | null;
  classNames: string[];
};

const SNIPPETS = {
  entry: `if (num_batches == 0 || num_classes == 0 || num_of_boxes == 0 ||
    max_output_boxes_per_class <= 0)
{
    return 0;
}
int64_t per_class_limit = max_output_boxes_per_class;
if (per_class_limit > num_of_boxes)
{
    per_class_limit = num_of_boxes;
}`,
  score: `if (score_threshold != nullptr && class_scores[box_index] < *score_threshold)
{
    continue;
}
packed_scores[candidate_count] = class_scores[box_index];
order[candidate_count++] = box_index;`,
  pack: `if (candidate_count <= 1)
{
    return;
}`,
  sort: `// Even phases swap (0,1),(2,3),... odd phases swap (1,2),(3,4),...
for (int phase = 0; phase < candidate_count; phase++)
{
    CompareSwapPairs(packed_scores, order, candidate_count, phase & 1);
}
// Swap iff left_score < right_score`,
  clear: `for (int i = 0; i < candidate_count; i++)
{
    suppressed[i] = 0;
}`,
  skip: `if (suppressed[i] != 0)
{
    continue;
}
const int index = order[i];`,
  keep: `int64_t* row = selected_indices + total_selected * 3;
row[0] = batch;
row[1] = cls;
row[2] = index;
total_selected++;
selected_for_class++;`,
  iou: `overlap_y = max(0, min(ymax_a, ymax_b) - max(ymin_a, ymin_b));
overlap_x = max(0, min(xmax_a, xmax_b) - max(xmin_a, xmin_b));
intersection = overlap_y * overlap_x;
union_area = area_kept + area_cand - intersection;
float iou = union_area > 0 ? intersection / union_area : 0;
if (suppressed[j] == 0 && iou > iou_threshold)
    suppressed[j] = 1;`,
  done: `delete[] suppressed;
delete[] packed_scores;
delete[] order;
return total_selected;`,
};

function cloneSnapshot(snapshot: NmsSnapshot): NmsSnapshot {
  return {
    cls: snapshot.cls,
    order: [...snapshot.order],
    candidateCount: snapshot.candidateCount,
    packedScores: [...snapshot.packedScores],
    suppressed: [...snapshot.suppressed],
    selected: snapshot.selected.map(
      (row) => [row[0], row[1], row[2]] as SelectedRow,
    ),
    selectedForClass: snapshot.selectedForClass,
    highlightBoxes: [...snapshot.highlightBoxes],
    currentBox: snapshot.currentBox,
    keptBox: snapshot.keptBox,
    compareBox: snapshot.compareBox,
  };
}

function laterSlotsText(order: number[], i: number): string {
  if (i + 1 >= order.length) {
    return "No later candidates to compare.";
  }
  const boxes = order.slice(i + 1);
  return `Next: IoU against later slots ${i + 1}…${order.length - 1} (boxes ${boxes.join(", ")}).`;
}

function classLabel(classNames: string[], cls: number): string {
  return classNames[cls] ?? `class ${cls}`;
}

export function buildTrace(input: TraceInput): TraceStep[] {
  const {
    boxes,
    scores,
    iouThreshold,
    scoreThreshold,
    classNames,
  } = input;
  const numBoxes = boxes.length;
  const numClasses = scores.length;
  const steps: TraceStep[] = [];

  if (
    numBoxes === 0 ||
    numClasses === 0 ||
    input.maxOutputBoxesPerClass <= 0
  ) {
    return [
      {
        kind: "done",
        fn: "NonMaxSuppression",
        title: "Empty / disabled input",
        explanation:
          "Sizes are zero or max_output_boxes_per_class <= 0, so the kernel returns 0 rows.",
        snippet: SNIPPETS.entry,
        snapshot: {
          cls: null,
          order: [],
          candidateCount: 0,
          packedScores: [],
          suppressed: new Array(numBoxes).fill(0),
          selected: [],
          selectedForClass: 0,
          highlightBoxes: [],
          currentBox: null,
          keptBox: null,
          compareBox: null,
        },
      },
    ];
  }

  const maxPerClass = Math.min(input.maxOutputBoxesPerClass, numBoxes);
  const snapshot: NmsSnapshot = {
    cls: null,
    order: [],
    candidateCount: 0,
    packedScores: [],
    suppressed: new Array(numBoxes).fill(0),
    selected: [],
    selectedForClass: 0,
    highlightBoxes: [],
    currentBox: null,
    keptBox: null,
    compareBox: null,
  };

  steps.push({
    kind: "entry",
    fn: "NonMaxSuppression",
    title: "Inputs and scratch",
    explanation: `center_point_box must be Corners (0). Each box is [y1, x1, y2, x2]. max_per_class = min(${input.maxOutputBoxesPerClass}, ${numBoxes}) = ${maxPerClass}. Scratch order[], packed_scores[], suppressed[] start empty / unused. total_selected = 0.`,
    snippet: SNIPPETS.entry,
    snapshot: cloneSnapshot(snapshot),
  });

  for (let cls = 0; cls < numClasses; cls++) {
    const name = classLabel(classNames, cls);
    const classScores = scores[cls];
    snapshot.cls = cls;
    snapshot.selectedForClass = 0;
    snapshot.packedScores = [];
    snapshot.order = [];
    snapshot.candidateCount = 0;
    snapshot.currentBox = null;
    snapshot.keptBox = null;
    snapshot.compareBox = null;
    snapshot.highlightBoxes = [];

    const order: number[] = [];
    const packedScores: number[] = [];
    for (let boxIndex = 0; boxIndex < numBoxes; boxIndex++) {
      const score = classScores[boxIndex];
      const passed =
        scoreThreshold === null || !(score < scoreThreshold);
      if (passed) {
        packedScores.push(score);
        order.push(boxIndex);
      }
      snapshot.order = [...order];
      snapshot.packedScores = [...packedScores];
      snapshot.candidateCount = order.length;
      snapshot.currentBox = boxIndex;
      snapshot.highlightBoxes = [boxIndex];
      const threshText =
        scoreThreshold === null ? "no threshold" : fmtScore(scoreThreshold);
      steps.push({
        kind: "score-filter",
        fn: "ApplyScoreSuppression",
        title: `${name}: score filter, box ${boxIndex}`,
        explanation: passed
          ? `Box ${boxIndex} score ${fmtScore(score)} >= ${threshText} → keep as a candidate. order[${order.length - 1}] = ${boxIndex}, packed_scores[${packedScores.length - 1}] = ${fmtScore(score)}.`
          : `Box ${boxIndex} score ${fmtScore(score)} < ${threshText} → skip. It cannot be selected for ${name}.`,
        snippet: SNIPPETS.score,
        snapshot: cloneSnapshot(snapshot),
        extra: { boxIndex, score, passed },
        quiz: {
          prompt: `${name}: keep box ${boxIndex} as a candidate? Score ${fmtScore(score)}, threshold ${threshText}.`,
          correct: passed ? "keep" : "drop",
          box: boxIndex,
        },
      });
    }

    snapshot.currentBox = null;
    snapshot.highlightBoxes = [...order];
    snapshot.candidateCount = order.length;
    snapshot.packedScores = [...packedScores];
    snapshot.order = [...order];

    if (order.length <= 1) {
      steps.push({
        kind: "pack",
        fn: "SortCandidatesByScore",
        title: `${name}: skip sort`,
        explanation:
          order.length === 0
            ? "No candidates survived the score filter, so there is nothing to sort."
            : "candidate_count <= 1, so SortCandidatesByScore returns immediately.",
        snippet: SNIPPETS.pack,
        snapshot: cloneSnapshot(snapshot),
      });
    } else {
      for (let phase = 0; phase < order.length; phase++) {
        const start = phase & 1;
        const pairs = compareSwapPairs(packedScores, order, start);
        snapshot.packedScores = [...packedScores];
        snapshot.order = [...order];
        snapshot.highlightBoxes = pairs.flatMap((pair) =>
          pair.swapped ? [pair.leftBox, pair.rightBox] : [],
        );
        const swapText = pairs
          .map((pair) =>
            pair.swapped
              ? `(${pair.leftIndex},${pair.rightIndex}) ${fmtScore(pair.leftScore)} < ${fmtScore(pair.rightScore)} → swap boxes ${pair.leftBox} and ${pair.rightBox}`
              : `(${pair.leftIndex},${pair.rightIndex}) ${fmtScore(pair.leftScore)} < ${fmtScore(pair.rightScore)}? no`,
          )
          .join("; ");
        const leftover = unpairedIndices(order.length, start);
        steps.push({
          kind: "sort-phase",
          fn: "CompareSwapPairs",
          title: `${name}: ${start === 0 ? "even" : "odd"} phase ${phase}`,
          explanation: `Phase ${phase} of ${order.length} (start = phase & 1 = ${start}). ${swapText || "No pairs."}${leftover.length ? ` Unpaired slot(s): ${leftover.join(", ")}.` : ""} order = [${order.join(", ")}].`,
          snippet: SNIPPETS.sort,
          snapshot: cloneSnapshot(snapshot),
          extra: {
            phase,
            start,
            label: start === 0 ? "even" : "odd",
            pairs,
            leftover,
          },
        });
      }
    }

    snapshot.suppressed = order.map(() => 0);
    snapshot.highlightBoxes = [...snapshot.order];
    snapshot.currentBox = null;
    snapshot.keptBox = null;
    snapshot.compareBox = null;
    steps.push({
      kind: "clear-suppressed",
      fn: "RunNmsLoops",
      title: `${name}: clear suppressed flags`,
      explanation: `suppressed[0…K) is reset for this class — same slots as order[]. order[i] is only the original box id (coords and selected row). selected_for_class = 0. Greedy starts at i = 0 → order[0] = box ${order[0] ?? "—"}.`,
      snippet: SNIPPETS.clear,
      snapshot: cloneSnapshot(snapshot),
    });

    let selectedForClass = 0;
    for (
      let i = 0;
      i < order.length && selectedForClass < maxPerClass;
      i++
    ) {
      const index = order[i];
      const lastKept =
        snapshot.selected.filter((row) => row[1] === cls).at(-1)?.[2] ?? null;
      snapshot.currentBox = index;
      snapshot.keptBox = lastKept;
      snapshot.compareBox = null;
      snapshot.highlightBoxes = lastKept === null ? [index] : [lastKept, index];
      if (snapshot.suppressed[i] !== 0) {
        steps.push({
          kind: "consider-skip",
          fn: "RunNmsLoops",
          title: `${name}: skip box ${index}`,
          explanation: `i = ${i} → order[${i}] = box ${index}. suppressed[${i}] == 1, so continue. Duplicate of a higher-score keep.`,
          snippet: SNIPPETS.skip,
          snapshot: cloneSnapshot(snapshot),
          quiz: {
            prompt: `${name}: box ${index} is next in sorted order. Keep or drop?`,
            correct: "drop",
            box: index,
          },
        });
        continue;
      }

      snapshot.selected.push([0, cls, index]);
      selectedForClass += 1;
      snapshot.selectedForClass = selectedForClass;
      snapshot.keptBox = index;
      snapshot.compareBox = null;
      snapshot.highlightBoxes = [index];
      steps.push({
        kind: "keep",
        fn: "RunNmsLoops",
        title: `${name}: keep box ${index}`,
        explanation: `i = ${i} → order[${i}] = box ${index} (score ${fmtScore(classScores[index])}). suppressed[${i}] == 0, and selected_for_class ${selectedForClass - 1} < max_per_class ${maxPerClass}. Write row [${0}, ${cls}, ${index}]. ${laterSlotsText(order, i)}`,
        snippet: SNIPPETS.keep,
        snapshot: cloneSnapshot(snapshot),
        extra: { boxIndex: index, score: classScores[index], passed: true },
        quiz: {
          prompt: `${name}: box ${index} (score ${fmtScore(classScores[index])}) is next and not suppressed. Keep or drop?`,
          correct: "keep",
          box: index,
        },
      });

      const kept = boxes[index];
      for (let j = i + 1; j < order.length; j++) {
        const other = order[j];
        const alreadySuppressed = snapshot.suppressed[j] !== 0;
        const breakdown = alreadySuppressed
          ? null
          : iouBreakdown(kept, boxes[other]);
        const didSuppress =
          breakdown !== null && breakdown.iou > iouThreshold;
        if (didSuppress) {
          snapshot.suppressed[j] = 1;
        }
        snapshot.keptBox = index;
        snapshot.compareBox = other;
        snapshot.highlightBoxes = [index, other];
        snapshot.currentBox = other;
        const threshText = fmtScore(iouThreshold);
        let explanation: string;
        if (alreadySuppressed || breakdown === null) {
          explanation = `Kept box ${index} (order[${i}]) vs order[${j}] = box ${other}. suppressed[${j}] == 1 already, so skip IoU.`;
        } else if (didSuppress) {
          explanation = `Kept box ${index} (order[${i}]) vs order[${j}] = box ${other}. This is scalar IoU: intersection / union. IoU = ${fmtIou(breakdown.iou)} > ${threshText} → suppressed[${j}] = 1.`;
        } else {
          explanation = `Kept box ${index} (order[${i}]) vs order[${j}] = box ${other}. This is scalar IoU: intersection / union. IoU = ${fmtIou(breakdown.iou)} ≤ ${threshText} → leave box ${other}.`;
        }
        steps.push({
          kind: "iou-compare",
          fn: "IoU",
          title: `${name}: IoU(box ${index}, box ${other})`,
          explanation,
          snippet: SNIPPETS.iou,
          snapshot: cloneSnapshot(snapshot),
          extra: {
            kept: index,
            other,
            keptSlot: i,
            otherSlot: j,
            breakdown,
            didSuppress,
            alreadySuppressed,
          },
          quiz: alreadySuppressed
            ? undefined
            : {
                prompt: `${name}: after keeping box ${index}, suppress box ${other}? IoU vs threshold ${threshText}.`,
                correct: didSuppress ? "drop" : "keep",
                box: other,
              },
        });
      }
    }

    if (selectedForClass >= maxPerClass && order.length > 0) {
      snapshot.currentBox = null;
      snapshot.keptBox = null;
      snapshot.compareBox = null;
      snapshot.highlightBoxes = snapshot.selected
        .filter((row) => row[1] === cls)
        .map((row) => row[2]);
      steps.push({
        kind: "class-cap",
        fn: "RunNmsLoops",
        title: `${name}: hit max_per_class`,
        explanation: `selected_for_class = ${selectedForClass} == max_per_class ${maxPerClass}. Remaining candidates are not visited.`,
        snippet: `for (int i = 0; i < candidate_count && selected_for_class < max_per_class; i++)`,
        snapshot: cloneSnapshot(snapshot),
      });
    }

    snapshot.currentBox = null;
    snapshot.keptBox = null;
    snapshot.compareBox = null;
    snapshot.highlightBoxes = snapshot.selected
      .filter((row) => row[1] === cls)
      .map((row) => row[2]);
    const keptBoxes = snapshot.highlightBoxes;
    if (numClasses === 1) {
      snapshot.cls = null;
      snapshot.currentBox = null;
      snapshot.keptBox = null;
      snapshot.compareBox = null;
      snapshot.highlightBoxes = snapshot.selected.map((row) => row[2]);
      steps.push({
        kind: "summary",
        fn: "NonMaxSuppression",
        title: "NMS pipeline",
        explanation:
          "Three stages per class — score filter, sort, greedy IoU.",
        snippet: "",
        snapshot: cloneSnapshot(snapshot),
      });
    } else {
      steps.push({
        kind: "class-done",
        fn: "RunNmsLoops",
        title: `${name}: class done`,
        explanation:
          keptBoxes.length === 0
            ? `No boxes kept for ${name}.`
            : `${name} kept: box ${keptBoxes.join(" and box ")}.`,
        snippet: SNIPPETS.keep,
        snapshot: cloneSnapshot(snapshot),
      });
    }
  }

  snapshot.cls = null;
  snapshot.currentBox = null;
  snapshot.keptBox = null;
  snapshot.compareBox = null;
  snapshot.highlightBoxes = snapshot.selected.map((row) => row[2]);
  if (numClasses > 1) {
    steps.push({
      kind: "summary",
      fn: "NonMaxSuppression",
      title: "NMS pipeline",
      explanation: `All ${numClasses} classes finished. Each runs score filter → sort → greedy IoU.`,
      snippet: "",
      snapshot: cloneSnapshot(snapshot),
    });
  }

  return steps;
}

export function isScoreFilterExtra(
  extra: TraceStep["extra"],
): extra is ScoreFilterExtra {
  return extra !== undefined && "passed" in extra && "boxIndex" in extra;
}

export function isSortPhaseExtra(
  extra: TraceStep["extra"],
): extra is SortPhaseExtra {
  return extra !== undefined && "pairs" in extra && "phase" in extra;
}

export function isIouCompareExtra(
  extra: TraceStep["extra"],
): extra is IouCompareExtra {
  return extra !== undefined && "didSuppress" in extra && "kept" in extra;
}
