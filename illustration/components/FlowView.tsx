"use client";

import FocusBuffers from "@/components/FocusBuffers";
import LessonBoard from "@/components/LessonBoard";
import SceneCanvas, { type BoxVisual } from "@/components/SceneCanvas";
import { intersectionRect } from "@/lib/geometry";
import {
  bufferSetForKind,
  collapseLaterClasses,
  highlightLineForStep,
  isClassSwitchStep,
  whatChanged,
} from "@/lib/lesson";
import { SCENES, sceneById, type Scene } from "@/lib/scenes";
import {
  buildTrace,
  isIouCompareExtra,
  isSortPhaseExtra,
  NMS_PIPELINE_SUMMARY,
  type TraceStep,
} from "@/lib/trace";
import { FLOW_SCORE_KEY } from "@/lib/quizStorage";
import { useBestScore } from "@/lib/useBestScore";
import { useMemo, useState } from "react";
import styles from "./FlowView.module.css";

type ViewClass = number | "all";

function deriveVisuals(
  scene: Scene,
  step: TraceStep,
  viewClass: ViewClass,
  scoreThreshold: number,
  pairHighlight: [number, number] | null,
): BoxVisual[] {
  const snapshot = step.snapshot;
  const classSwitch = isClassSwitchStep(step);
  const focusCls =
    viewClass !== "all" ? viewClass : snapshot.cls;
  // Score-drop styling only after the filter finishes — not on entry / mid-pass.
  const scoreFilterDone =
    !classSwitch &&
    step.kind !== "entry" &&
    step.kind !== "score-filter";

  return scene.boxes.map((_, index) => {
    const keptClasses = snapshot.selected
      .filter((row) => row[2] === index)
      .map((row) => row[1]);
    const dropped =
      scoreFilterDone &&
      focusCls !== null &&
      scene.scores[focusCls][index] < scoreThreshold;
    const inOrder = snapshot.order
      .slice(0, snapshot.candidateCount)
      .includes(index);
    const slot = snapshot.order.indexOf(index);
    const suppressed =
      !classSwitch && slot >= 0 && snapshot.suppressed[slot] === 1;
    // While walking a class, only that class's keeps tint the box — so the
    // next class can show every box again.
    const kept =
      focusCls !== null
        ? keptClasses.includes(focusCls)
        : keptClasses.length > 0;

    let state: BoxVisual["state"] = "pending";
    if (dropped && !kept) {
      state = "dropped";
    } else if (suppressed && !kept) {
      state = "suppressed";
    } else if (kept) {
      state = "kept";
    } else if (inOrder) {
      state = "candidate";
    }
    if (pairHighlight) {
      if (index === pairHighlight[0]) {
        state = "kept";
      } else if (index === pairHighlight[1]) {
        state = "current";
      }
    } else if (snapshot.currentBox === index) {
      state = "current";
    }

    return { index, state, keptClasses };
  });
}

function classBadge(
  step: TraceStep,
  classNames: string[],
): { cls: number; name: string } | null {
  const cls = step.snapshot.cls;
  if (cls === null) {
    return null;
  }
  return { cls, name: classNames[cls] ?? `class ${cls}` };
}

export default function FlowView() {
  const [sceneId, setSceneId] = useState(SCENES[0].id);
  const scene = sceneById(sceneId);
  const [scoreThreshold, setScoreThreshold] = useState(scene.scoreThreshold);
  const [iouThreshold, setIouThreshold] = useState(scene.iouThreshold);
  const [maxPerClass, setMaxPerClass] = useState(scene.maxOutputBoxesPerClass);
  const [viewClass, setViewClass] = useState<ViewClass>("all");
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedBox, setSelectedBox] = useState<number | null>(null);
  const [predict, setPredict] = useState(false);
  const [answers, setAnswers] = useState<Record<number, "keep" | "drop">>({});
  const [sessionScore, setSessionScore] = useState(0);
  const [best, setBest] = useBestScore(FLOW_SCORE_KEY);

  const resetWalk = () => {
    setStepIndex(0);
    setAnswers({});
  };

  const applyScene = (next: Scene) => {
    setSceneId(next.id);
    setScoreThreshold(next.scoreThreshold);
    setIouThreshold(next.iouThreshold);
    setMaxPerClass(next.maxOutputBoxesPerClass);
    setSessionScore(0);
    setSelectedBox(null);
    setViewClass("all");
    resetWalk();
  };

  const steps = useMemo(
    () =>
      collapseLaterClasses(
        buildTrace({
          boxes: scene.boxes,
          scores: scene.scores,
          maxOutputBoxesPerClass: maxPerClass,
          iouThreshold,
          scoreThreshold,
          classNames: scene.classNames,
        }),
        scene.classNames,
      ),
    [scene, maxPerClass, iouThreshold, scoreThreshold],
  );

  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const quiz = predict ? step?.quiz : undefined;
  const waiting = Boolean(predict && quiz && answers[stepIndex] === undefined);
  const shown = waiting ? steps[Math.max(0, stepIndex - 1)] : step;
  const viewCls =
    viewClass === "all" ? (shown.snapshot.cls ?? 0) : viewClass;
  const badge = classBadge(shown, scene.classNames);

  const pairHighlight =
    shown.kind === "summary"
      ? null
      : isIouCompareExtra(shown.extra)
        ? ([shown.extra.kept, shown.extra.other] as [number, number])
        : shown.snapshot.keptBox !== null && shown.snapshot.compareBox !== null
          ? ([shown.snapshot.keptBox, shown.snapshot.compareBox] as [number, number])
          : null;
  const intersection =
    pairHighlight &&
    intersectionRect(scene.boxes[pairHighlight[0]], scene.boxes[pairHighlight[1]]);

  const onAnswer = (choice: "keep" | "drop") => {
    if (!quiz || answers[stepIndex] !== undefined) {
      return;
    }
    const correct = choice === quiz.correct;
    const next = sessionScore + (correct ? 1 : 0);
    setSessionScore(next);
    setBest(next);
    setAnswers((prev) => ({ ...prev, [stepIndex]: choice }));
  };

  return (
    <div className={styles.page}>
      <details className="fold">
        <summary>Scene</summary>
        <div className={styles.toolbar}>
          <label>
            Scene
            <select
              value={sceneId}
              onChange={(event) => applyScene(sceneById(event.target.value))}
            >
              {SCENES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {scene.classNames.length > 1 ? (
            <label>
              Class view
              <select
                value={String(viewClass)}
                onChange={(event) => {
                  const value = event.target.value;
                  setViewClass(value === "all" ? "all" : Number(value));
                }}
              >
                <option value="all">follow active class</option>
                {scene.classNames.map((name, cls) => (
                  <option key={cls} value={cls}>
                    {cls} {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            score_threshold {scoreThreshold.toFixed(2)}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={scoreThreshold}
              onChange={(event) => {
                setScoreThreshold(Number(event.target.value));
                resetWalk();
              }}
            />
          </label>
          <label>
            iou_threshold {iouThreshold.toFixed(2)}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={iouThreshold}
              onChange={(event) => {
                setIouThreshold(Number(event.target.value));
                resetWalk();
              }}
            />
          </label>
          <label>
            max_per_class {maxPerClass}
            <input
              type="range"
              min={1}
              max={Math.max(scene.boxes.length, 1)}
              step={1}
              value={maxPerClass}
              onChange={(event) => {
                setMaxPerClass(Number(event.target.value));
                resetWalk();
              }}
            />
          </label>
        </div>
        <p className={styles.lead}>{scene.description}</p>
      </details>

      <LessonBoard
        watching={
          waiting ? `Predict: ${quiz?.prompt}` : shown.explanation
        }
        fn={shown.kind === "summary" ? undefined : shown.fn}
        index={stepIndex}
        total={steps.length}
        nextDisabled={waiting}
        onReset={() => {
          resetWalk();
          setSessionScore(0);
        }}
        onPrev={() => setStepIndex((n) => Math.max(0, n - 1))}
        onNext={() => setStepIndex((n) => Math.min(steps.length - 1, n + 1))}
        code={shown.snippet}
        highlightLine={highlightLineForStep(shown)}
        summarySteps={shown.kind === "summary" ? NMS_PIPELINE_SUMMARY : undefined}
        summaryOnly={shown.kind === "summary"}
        changed={
          shown.kind === "summary"
            ? undefined
            : waiting
              ? "Answer keep or drop to reveal this step."
              : whatChanged(shown)
        }
        extraBar={
          shown.kind === "summary"
            ? undefined
            : badge ? (
            <div className={styles.classBar}>
              <span className={styles.classLabel}>Active class</span>
              <div className={styles.classSwitch}>
                {scene.classNames.map((name, cls) => (
                  <span
                    key={cls}
                    className={`${styles.classPill} ${styles[`class${cls % 2}`]} ${
                      badge.cls === cls ? styles.classOn : styles.classOff
                    }`}
                  >
                    {cls} {name}
                    {badge.cls === cls
                      ? isClassSwitchStep(shown)
                        ? " · same process"
                        : " · walking"
                      : cls < badge.cls
                        ? " · done"
                        : " · next"}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.classBar}>
              <span className={styles.classLabel}>Active class</span>
              <span className={styles.classMuted}>
                {shown.kind === "done"
                  ? "All classes finished — return selected_indices"
                  : "Inputs / scratch (before the class loop)"}
              </span>
            </div>
          )
        }
        data={
          shown.kind === "summary" ? undefined : (
          <div className={styles.dataCol}>
            <SceneCanvas
              boxes={scene.boxes}
              objects={scene.objects}
              visuals={deriveVisuals(scene, shown, viewClass, scoreThreshold, pairHighlight)}
              scores={scene.scores}
              classNames={scene.classNames}
              selectedBox={selectedBox ?? shown.snapshot.currentBox}
              onSelectBox={setSelectedBox}
              pairHighlight={pairHighlight}
              intersection={intersection}
            />
            <FocusBuffers
              stage={bufferSetForKind(shown.kind)}
              boxes={scene.boxes}
              scores={scene.scores}
              classNames={scene.classNames}
              snapshot={shown.snapshot}
              viewClass={viewCls}
              pairs={
                isSortPhaseExtra(shown.extra) ? shown.extra.pairs : []
              }
              leftover={
                isSortPhaseExtra(shown.extra) ? shown.extra.leftover : []
              }
              extra={shown.extra}
            />
          </div>
          )
        }
      />

      <details className="fold">
        <summary>
          Check yourself {predict ? `· quiz ${sessionScore} · best ${best}` : ""}
        </summary>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={predict}
            onChange={(event) => setPredict(event.target.checked)}
          />
          Predict keep / drop before each decision
        </label>
        {waiting ? (
          <div className={styles.quizBtns}>
            <button type="button" className="btn primary" onClick={() => onAnswer("keep")}>
              Keep
            </button>
            <button type="button" className="btn warn" onClick={() => onAnswer("drop")}>
              Drop / suppress
            </button>
          </div>
        ) : null}
        {quiz && answers[stepIndex] !== undefined ? (
          <p className={answers[stepIndex] === quiz.correct ? styles.ok : styles.bad}>
            {answers[stepIndex] === quiz.correct ? "Correct. " : "Not quite. "}
            Kernel does {quiz.correct} for box {quiz.box}.
          </p>
        ) : null}
      </details>
    </div>
  );
}
