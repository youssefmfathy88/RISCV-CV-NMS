"use client";

import LessonBoard from "@/components/LessonBoard";
import VectorDataFlow from "@/components/VectorDataFlow";
import { WALKTHROUGH } from "@/lib/scenes";
import {
  buildVectorLesson,
  type VectorLessonId,
} from "@/lib/vectorTrace";
import type { TeachingVlmax } from "@/lib/walkthrough";
import { useMemo } from "react";

type Props = {
  lesson: VectorLessonId;
  vlmax: TeachingVlmax;
  stepIndex: number;
  onStepIndex: (index: number) => void;
};

export default function VectorLesson({
  lesson,
  vlmax,
  stepIndex,
  onStepIndex,
}: Props) {
  const result = useMemo(
    () =>
      buildVectorLesson(lesson, {
        boxes: WALKTHROUGH.boxes,
        classScores: WALKTHROUGH.scores[0],
        scoreThreshold: WALKTHROUGH.scoreThreshold,
        iouThreshold: WALKTHROUGH.iouThreshold,
        maxPerClass: WALKTHROUGH.maxOutputBoxesPerClass,
        vlmax,
      }),
    [lesson, vlmax],
  );

  const steps = result.steps;
  const last = Math.max(0, steps.length - 1);
  const index = Math.min(stepIndex, last);
  const step = steps[index];

  if (!step) {
    return <p>No vector steps for this stage.</p>;
  }

  const snippet = `${step.helper}
// ${step.intrinsic}
${step.snippet}`;

  return (
    <LessonBoard
      watching={step.watching}
      fn={`${step.fn} · ${step.helper}`}
      index={index}
      total={Math.max(steps.length, 1)}
      onReset={() => onStepIndex(0)}
      onPrev={() => onStepIndex(Math.max(0, index - 1))}
      onNext={() => onStepIndex(Math.min(last, index + 1))}
      code={snippet}
      highlightLine={step.highlightLine + 2}
      changed={step.changed}
      data={<VectorDataFlow step={step} />}
    />
  );
}
