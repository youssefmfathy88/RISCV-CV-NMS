"use client";

import ScalarLesson from "@/components/ScalarWalk";
import StageBrief from "@/components/StageBrief";
import VectorLesson from "@/components/VectorLesson";
import type { VectorLessonId } from "@/lib/vectorTrace";
import {
  STAGES,
  TEACHING_VLMAX,
  type LessonMode,
  type StageId,
  type TeachingVlmax,
  type VectorPart,
} from "@/lib/walkthrough";
import { useState } from "react";
import styles from "./WalkthroughSession.module.css";

function vectorLessonFor(stage: StageId, part: VectorPart): VectorLessonId {
  if (stage === "sort") {
    return "sorting";
  }
  if (stage === "greedy") {
    return part;
  }
  if (stage === "inputs" || stage === "score") {
    return stage;
  }
  return "inputs";
}

export default function WalkthroughSession() {
  const [stage, setStage] = useState<StageId>("inputs");
  const [mode, setMode] = useState<LessonMode>("brief");
  const [vectorPart, setVectorPart] = useState<VectorPart>("packing");
  const [stepIndex, setStepIndex] = useState(0);
  const [vlmax, setVlmax] = useState<TeachingVlmax>(4);

  const lesson = vectorLessonFor(stage, vectorPart);

  return (
    <div className={styles.page}>
      <header className={styles.toolbar}>
        <ol className={styles.stages}>
          {STAGES.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={stage === item.id ? styles.on : undefined}
                onClick={() => {
                  setStage(item.id);
                  setMode("brief");
                  setStepIndex(0);
                  if (item.id === "greedy") {
                    setVectorPart("packing");
                  }
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ol>
      </header>

      <header className={styles.toolbar}>
        <ol className={styles.modes}>
          <li>
            <button
              type="button"
              className={mode === "brief" ? styles.on : undefined}
              onClick={() => {
                setMode("brief");
                setStepIndex(0);
              }}
            >
              Brief
            </button>
          </li>
          <li>
            <button
              type="button"
              className={mode === "scalar" ? styles.on : undefined}
              onClick={() => {
                setMode("scalar");
                setStepIndex(0);
              }}
            >
              Scalar
            </button>
          </li>
          <li>
            <button
              type="button"
              className={mode === "vector" ? styles.vectorOn : undefined}
              onClick={() => {
                setMode("vector");
                setStepIndex(0);
              }}
            >
              Vector
            </button>
          </li>
        </ol>

        {mode === "vector" && stage === "greedy" ? (
          <ol className={styles.modes}>
            <li>
              <button
                type="button"
                className={vectorPart === "packing" ? styles.vectorOn : undefined}
                onClick={() => {
                  setVectorPart("packing");
                  setStepIndex(0);
                }}
              >
                Pack boxes
              </button>
            </li>
            <li>
              <button
                type="button"
                className={vectorPart === "greedy" ? styles.vectorOn : undefined}
                onClick={() => {
                  setVectorPart("greedy");
                  setStepIndex(0);
                }}
              >
                Scan + IoU
              </button>
            </li>
          </ol>
        ) : null}

        {mode === "vector" ? (
          <label className={styles.vlmax}>
            Teaching VLMAX
            <select
              value={vlmax}
              onChange={(event) => {
                setVlmax(Number(event.target.value) as TeachingVlmax);
                setStepIndex(0);
              }}
            >
              {TEACHING_VLMAX.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <span className={styles.hint}>
              Simulates hardware-dependent VLMAX. Default 4 splits five
              candidates into a full strip plus a tail.
            </span>
          </label>
        ) : null}
      </header>

      {mode === "brief" ? (
        <StageBrief
          stage={stage}
          stepIndex={stepIndex}
          onStepIndex={setStepIndex}
        />
      ) : mode === "scalar" ? (
        <ScalarLesson key={stage} stage={stage} />
      ) : (
        <VectorLesson
          lesson={lesson}
          vlmax={vlmax}
          stepIndex={stepIndex}
          onStepIndex={setStepIndex}
        />
      )}
    </div>
  );
}
