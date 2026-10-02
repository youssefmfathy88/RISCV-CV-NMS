"use client";

import FocusBuffers from "@/components/FocusBuffers";
import LessonBoard from "@/components/LessonBoard";
import { fmtScore } from "@/lib/format";
import {
  bufferSetForKind,
  highlightLineForStep,
  whatChanged,
} from "@/lib/lesson";
import { WALKTHROUGH } from "@/lib/scenes";
import {
  buildTrace,
  isSortPhaseExtra,
  type TraceKind,
  type TraceStep,
} from "@/lib/trace";
import type { StageId } from "@/lib/walkthrough";
import { useMemo, useState } from "react";
import styles from "./ScalarWalk.module.css";

const STAGE_KINDS: Record<Exclude<StageId, "inputs">, TraceKind[]> = {
  score: ["score-filter"],
  sort: ["pack", "sort-phase"],
  greedy: [
    "clear-suppressed",
    "consider-skip",
    "keep",
    "iou-compare",
    "class-cap",
    "class-done",
  ],
};

const INPUT_SNIPPET = `int* order = new int[num_of_boxes];
float* packed_scores = new float[num_of_boxes];
uint8_t* suppressed = new uint8_t[num_of_boxes];
const float* class_scores = scores +
    (batch * num_classes + cls) * num_of_boxes;`;

function classSteps(steps: TraceStep[], cls: number): TraceStep[] {
  return steps.filter((step) => step.snapshot.cls === cls);
}

export default function ScalarLesson({ stage }: { stage: StageId }) {
  const scene = WALKTHROUGH;
  const [stepIndex, setStepIndex] = useState(0);

  const trace = useMemo(
    () =>
      buildTrace({
        boxes: scene.boxes,
        scores: scene.scores,
        maxOutputBoxesPerClass: scene.maxOutputBoxesPerClass,
        iouThreshold: scene.iouThreshold,
        scoreThreshold: scene.scoreThreshold,
        classNames: scene.classNames,
      }),
    [scene],
  );

  const forClass = useMemo(() => classSteps(trace, 0), [trace]);

  const steps = useMemo(() => {
    if (stage === "inputs") {
      return [];
    }
    const kinds = STAGE_KINDS[stage];
    return forClass.filter((step) => kinds.includes(step.kind));
  }, [forClass, stage]);

  const entry = trace[0];
  const clamped = Math.min(stepIndex, Math.max(0, steps.length - 1));
  const step = steps[clamped];
  const snapshot = step?.snapshot ?? { ...entry.snapshot, cls: 0 };

  const watching =
    stage === "inputs"
      ? `Class 0 ${scene.classNames[0]}. Thresholds: score ${fmtScore(scene.scoreThreshold)}, IoU ${fmtScore(scene.iouThreshold)}.`
      : step?.explanation ?? "";

  return (
    <div className={styles.page}>
      <LessonBoard
        watching={watching}
        fn={step?.fn ?? "NonMaxSuppression"}
        index={stage === "inputs" ? 0 : clamped}
        total={stage === "inputs" ? 1 : Math.max(steps.length, 1)}
        onReset={() => setStepIndex(0)}
        onPrev={() => setStepIndex((n) => Math.max(0, n - 1))}
        onNext={() => setStepIndex((n) => Math.min(steps.length - 1, n + 1))}
        code={step?.snippet ?? INPUT_SNIPPET}
        highlightLine={step ? highlightLineForStep(step) : 0}
        changed={
          step
            ? whatChanged(step)
            : "Scratch is empty. Next: write survivors into order[]."
        }
        data={
          <FocusBuffers
            stage={step ? bufferSetForKind(step.kind) : "inputs"}
            boxes={scene.boxes}
            scores={scene.scores}
            classNames={scene.classNames}
            snapshot={snapshot}
            viewClass={0}
            pairs={
              step && isSortPhaseExtra(step.extra) ? step.extra.pairs : []
            }
            leftover={
              step && isSortPhaseExtra(step.extra) ? step.extra.leftover : []
            }
            extra={step?.extra}
          />
        }
      />
    </div>
  );
}
