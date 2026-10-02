import type { TraceKind, TraceStep } from "./trace";
import { isIouCompareExtra, isScoreFilterExtra, isSortPhaseExtra } from "./trace";
import { fmtIou, fmtScore } from "./format";

export type BufferSet = "inputs" | "score" | "sort" | "greedy" | "summary";

export function isClassSwitchStep(step: TraceStep): boolean {
  return step.fn === "ClassSwitch";
}

/**
 * Full detail for class 0 only. Each later class collapses to one "same process"
 * switch slide (boxes reset visually in the UI). Trace math is unchanged.
 */
export function collapseLaterClasses(
  steps: TraceStep[],
  classNames: string[],
): TraceStep[] {
  const out: TraceStep[] = [];

  for (const step of steps) {
    const cls = step.snapshot.cls;
    if (
      step.kind === "entry" ||
      step.kind === "done" ||
      step.kind === "summary" ||
      cls === null ||
      cls === 0
    ) {
      out.push(step);
      continue;
    }
    if (step.kind !== "class-done") {
      continue;
    }

    const name = classNames[cls] ?? `class ${cls}`;
    const prevName = classNames[cls - 1] ?? `class ${cls - 1}`;
    const kept = step.snapshot.selected
      .filter((row) => row[1] === cls)
      .map((row) => row[2]);
    const numBoxes = step.snapshot.suppressed.length;

    out.push({
      kind: "class-done",
      fn: "ClassSwitch",
      title: `Switch to class ${cls}: ${name}`,
      explanation: `Class ${cls - 1} (${prevName}) finished. Switch to class ${cls} (${name}): same score filter → sort → greedy IoU — only the class_scores row changes. Boxes return for this class; we skip repeating every step. ${
        kept.length > 0
          ? `${name} keeps box ${kept.join(" and box ")}.`
          : `${name} keeps nothing.`
      }`,
      snippet: `for (int cls = 0; cls < num_classes; ++cls) {
  // ApplyScoreSuppression → sort → greedy IoU
  // same process as class 0 — only class_scores changes
}`,
      snapshot: {
        ...step.snapshot,
        suppressed: Array.from({ length: numBoxes }, () => 0),
        order: [],
        candidateCount: 0,
        packedScores: [],
        currentBox: null,
        keptBox: null,
        compareBox: null,
        highlightBoxes: kept,
      },
    });
  }

  return out;
}

export function bufferSetForKind(kind: TraceKind): BufferSet {
  switch (kind) {
    case "entry":
      return "inputs";
    case "score-filter":
      return "score";
    case "pack":
    case "sort-phase":
      return "sort";
    case "summary":
      return "summary";
    default:
      return "greedy";
  }
}

export function highlightLineForStep(step: TraceStep): number {
  const extra = step.extra;
  if (step.kind === "score-filter" && isScoreFilterExtra(extra)) {
    return extra.passed ? 4 : 2;
  }
  if (step.kind === "pack") {
    return 0;
  }
  if (step.kind === "sort-phase" && isSortPhaseExtra(extra)) {
    return extra.pairs.some((pair) => pair.swapped) ? 4 : 4;
  }
  if (step.kind === "consider-skip") {
    return 2;
  }
  if (step.kind === "keep") {
    return 2;
  }
  if (step.kind === "iou-compare" && isIouCompareExtra(extra)) {
    if (extra.alreadySuppressed) {
      return 5;
    }
    return extra.didSuppress ? 6 : 4;
  }
  if (step.kind === "clear-suppressed") {
    return 2;
  }
  return 0;
}

export function whatChanged(step: TraceStep): string {
  const extra = step.extra;
  const snap = step.snapshot;
  if (step.kind === "entry") {
    return "Scratch order[], packed_scores[], suppressed[] allocated. total_selected = 0.";
  }
  if (step.kind === "score-filter" && isScoreFilterExtra(extra)) {
    return extra.passed
      ? `order[${snap.order.length - 1}] = ${extra.boxIndex}, packed_scores[${snap.packedScores.length - 1}] = ${fmtScore(extra.score)}`
      : `skip box ${extra.boxIndex}  (score ${fmtScore(extra.score)} below threshold)`;
  }
  if (step.kind === "pack") {
    return snap.order.length === 0
      ? "No survivors to sort."
      : "candidate_count <= 1, skip sort.";
  }
  if (step.kind === "sort-phase" && isSortPhaseExtra(extra)) {
    const swapped = extra.pairs.filter((pair) => pair.swapped);
    if (swapped.length === 0) {
      return `${extra.label} phase ${extra.phase}: no swap. order stays [${snap.order.join(", ")}]`;
    }
    return swapped
      .map(
        (pair) =>
          `swap (${pair.leftIndex},${pair.rightIndex}) boxes ${pair.leftBox} ↔ ${pair.rightBox}`,
      )
      .join(" · ");
  }
  if (step.kind === "clear-suppressed") {
    return "suppressed[0…K) = 0 for this class (same slots as order[]).";
  }
  if (step.kind === "consider-skip") {
    const slot = snap.currentBox === null ? -1 : snap.order.indexOf(snap.currentBox);
    return slot >= 0
      ? `suppressed[${slot}] == 1 → continue.`
      : `suppressed slot is dead → continue.`;
  }
  if (step.kind === "keep") {
    const last = snap.selected[snap.selected.length - 1];
    if (!last) {
      return "keep";
    }
    const slot = snap.order.indexOf(last[2]);
    const later = slot >= 0 ? snap.order.slice(slot + 1) : [];
    return later.length
      ? `write selected_indices row [${last.join(", ")}]. Next vs boxes ${later.join(", ")}`
      : `write selected_indices row [${last.join(", ")}]`;
  }
  if (step.kind === "iou-compare" && isIouCompareExtra(extra)) {
    if (extra.alreadySuppressed) {
      return `order[${extra.otherSlot}] = box ${extra.other} already suppressed → skip IoU`;
    }
    const iouText = extra.breakdown ? fmtIou(extra.breakdown.iou) : "0";
    return extra.didSuppress
      ? `kept box ${extra.kept} vs box ${extra.other} · IoU ${iouText} > threshold → suppressed[${extra.otherSlot}] = 1`
      : `kept box ${extra.kept} vs box ${extra.other} · IoU ${iouText} ≤ threshold → leave box ${extra.other}`;
  }
  if (step.kind === "class-cap") {
    return `selected_for_class hit max_per_class.`;
  }
  if (step.kind === "class-done") {
    return isClassSwitchStep(step)
      ? "class loop: same process, new class_scores row"
      : step.explanation;
  }
  if (step.kind === "summary") {
    return snap.selected.length === 0
      ? "Output: no rows in selected_indices."
      : `Output: ${snap.selected.length} row(s) in selected_indices.`;
  }
  if (step.kind === "done") {
    return `return ${snap.selected.length} rows.`;
  }
  return step.explanation;
}
