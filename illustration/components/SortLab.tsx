"use client";

import LessonBoard from "@/components/LessonBoard";
import { fmtScore } from "@/lib/format";
import {
  applyScoreSuppression,
  isSortedDescending,
  packCandidateScores,
  sortCandidatesByScore,
  unpairedIndices,
  type SwapPair,
} from "@/lib/nms";
import { SORT_SCORE_KEY } from "@/lib/quizStorage";
import { WALKTHROUGH } from "@/lib/scenes";
import { useBestScore } from "@/lib/useBestScore";
import { useMemo, useState } from "react";
import styles from "./SortLab.module.css";

type Demo = {
  id: string;
  name: string;
  scores: number[];
  order: number[];
  note: string;
};

const WALKTHROUGH_PACKED = applyScoreSuppression(
  WALKTHROUGH.scores[0],
  WALKTHROUGH.scoreThreshold,
);

const DEMOS: Demo[] = [
  {
    id: "walkthrough",
    name: "Walkthrough class 0 (5 candidates)",
    scores: WALKTHROUGH.scores[0],
    order: WALKTHROUGH_PACKED.order,
    note: `After score filter skips biggest box 2 (${WALKTHROUGH.scores[0][2].toFixed(2)}). Packed starts [${WALKTHROUGH_PACKED.packedScores.map((score) => score.toFixed(2)).join(", ")}] — not descending. Even pairs swap; slot ${WALKTHROUGH_PACKED.order.length - 1} unpaired.`,
  },
  {
    id: "six-reverse",
    name: "Six scores, reverse order (worst case)",
    scores: [0.1, 0.2, 0.4, 0.55, 0.7, 0.95],
    order: [0, 1, 2, 3, 4, 5],
    note: "Worst case for descending odd-even. Same three even pairs; values start further from sorted.",
  },
];

const SWAP_SNIPPET = `const float left_score = packed_scores[i];
const float right_score = packed_scores[i + 1];
if (left_score < right_score)
{
    packed_scores[i] = right_score;
    packed_scores[i + 1] = left_score;
    swap order[i] with order[i + 1];
}`;

export default function SortLab() {
  const [demoId, setDemoId] = useState(DEMOS[0].id);
  const demo = DEMOS.find((item) => item.id === demoId) ?? DEMOS[0];
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [showPacked, setShowPacked] = useState(true);
  const [guess, setGuess] = useState<Set<number>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [quizOk, setQuizOk] = useState<boolean | null>(null);
  const [best, setBest] = useBestScore(SORT_SCORE_KEY);

  const applyDemo = (id: string) => {
    setDemoId(id);
    setPhaseIndex(0);
    setShowPacked(true);
    setGuess(new Set());
    setSubmitted(false);
    setQuizOk(null);
  };

  const run = useMemo(() => {
    const order = [...demo.order];
    const packedAtStart = packCandidateScores(demo.scores, order);
    const { phases } = sortCandidatesByScore(order, packedAtStart);
    const firstSorted = phases.findIndex((phase) =>
      isSortedDescending(phase.packedScores),
    );
    return { packedAtStart, phases, finalOrder: order, firstSorted };
  }, [demo]);

  const k = demo.order.length;
  const iterationCount = Math.ceil(k / 2);
  const packedBefore = showPacked
    ? run.packedAtStart
    : phaseIndex === 0
      ? run.packedAtStart
      : run.phases[phaseIndex - 1].packedScores;
  const orderBefore = showPacked
    ? demo.order
    : phaseIndex === 0
      ? demo.order
      : run.phases[phaseIndex - 1].order;
  const packedAfter = showPacked
    ? run.packedAtStart
    : (run.phases[phaseIndex]?.packedScores ?? packedBefore);
  const orderAfter = showPacked
    ? demo.order
    : (run.phases[phaseIndex]?.order ?? orderBefore);
  const phase = showPacked ? null : run.phases[phaseIndex];
  const start = phase ? phase.start : 0;
  const leftover = phase ? unpairedIndices(orderAfter.length, start) : [];
  const pairs: SwapPair[] = phase?.pairs ?? [];
  const swapped = pairs.filter((pair) => pair.swapped);
  const sortedAfter = isSortedDescending(packedAfter);
  const lastPhase = !showPacked && phaseIndex >= run.phases.length - 1;
  const navIndex = showPacked ? 0 : phaseIndex + 1;
  const navTotal = run.phases.length + 1;
  const stopSortedNote =
    run.firstSorted < 0
      ? ""
      : run.firstSorted === k - 1
        ? ", and the values first become descending on that last phase."
        : `, but the values first become descending at phase ${run.firstSorted} — the remaining phases still run until K.`;

  const quizPairs = useMemo(() => {
    const reverse = DEMOS.find((item) => item.id === "six-reverse") ?? DEMOS[1];
    const order = [...reverse.order];
    const packed = packCandidateScores(reverse.scores, order);
    const { phases } = sortCandidatesByScore(order, packed);
    return phases[0]?.pairs ?? [];
  }, []);

  const goPhase = (index: number) => {
    setShowPacked(false);
    setPhaseIndex(Math.max(0, Math.min(run.phases.length - 1, index)));
  };

  const toggleGuess = (leftIndex: number) => {
    if (submitted) {
      return;
    }
    setGuess((prev) => {
      const next = new Set(prev);
      if (next.has(leftIndex)) {
        next.delete(leftIndex);
      } else {
        next.add(leftIndex);
      }
      return next;
    });
  };

  const submitQuiz = () => {
    const expected = new Set(
      quizPairs.filter((pair) => pair.swapped).map((pair) => pair.leftIndex),
    );
    const correct =
      expected.size === guess.size &&
      [...expected].every((value) => guess.has(value));
    setSubmitted(true);
    setQuizOk(correct);
    if (correct) {
      setBest(1);
    }
  };

  const watching = showPacked
    ? demo.note
    : `${phase?.label} phase ${phase?.phase}: watch the highlighted pairs.`;

  const changed = showPacked
    ? `packed = [${packedAfter.map(fmtScore).join(", ")}]`
    : lastPhase
      ? `phase ${k} < ${k}? no. Stop.${stopSortedNote}`
      : swapped.length
        ? swapped
            .map((pair) => `swap (${pair.leftIndex},${pair.rightIndex})`)
            .join(" · ")
        : "no swap this phase";

  return (
    <div className={styles.page}>
      <LessonBoard
        watching={watching}
        fn="CompareSwapPairs"
        index={navIndex}
        total={navTotal}
        onReset={() => {
          setShowPacked(true);
          setPhaseIndex(0);
        }}
        onPrev={() => {
          if (showPacked) {
            return;
          }
          if (phaseIndex === 0) {
            setShowPacked(true);
            return;
          }
          setPhaseIndex((n) => n - 1);
        }}
        onNext={() => {
          if (showPacked) {
            setShowPacked(false);
            setPhaseIndex(0);
            return;
          }
          setPhaseIndex((n) => Math.min(run.phases.length - 1, n + 1));
        }}
        extraBar={
          <div className={styles.toolbar}>
            <label>
              Demo
              <select
                value={demoId}
                onChange={(event) => applyDemo(event.target.value)}
              >
                {DEMOS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="mono">
              K = {k} phases = {iterationCount} iterations
            </span>
          </div>
        }
        code={SWAP_SNIPPET}
        highlightLine={swapped.length ? 2 : 0}
        changed={changed}
        data={
          <div>
            <Row
              label="packed_scores"
              values={packedAfter.map(fmtScore)}
              pairs={pairs}
              leftover={leftover}
              reveal={!showPacked}
            />
            <Row
              label="order (box index)"
              values={orderAfter.map(String)}
              pairs={pairs}
              leftover={leftover}
              reveal={!showPacked}
              boxRow
            />
            {phase && sortedAfter ? (
              <p className={styles.ok}>
                Descending after phase {phase.phase} ({phase.label}).
              </p>
            ) : null}
            {phase && !sortedAfter ? (
              <p className={styles.still}>
                Still unsorted after phase {phase.phase}. Continue until phase == K.
              </p>
            ) : null}
          </div>
        }
      />

      <details className="fold">
        <summary>Iteration strip</summary>
        <ol className={styles.iterStrip}>
          <li>
            <button
              type="button"
              className={showPacked ? styles.stripOn : undefined}
              onClick={() => {
                setShowPacked(true);
                setPhaseIndex(0);
              }}
            >
              Start
              <span>not sorted</span>
            </button>
          </li>
          {Array.from({ length: iterationCount }, (_, iter) => {
            const endPhase = Math.min(k - 1, iter * 2 + 1);
            const after = run.phases[endPhase];
            const sorted = after
              ? isSortedDescending(after.packedScores)
              : false;
            const active =
              !showPacked && Math.floor(phaseIndex / 2) === iter;
            return (
              <li key={iter}>
                <button
                  type="button"
                  className={`${active ? styles.stripOn : ""} ${sorted ? styles.stripSorted : styles.stripUnsorted}`}
                  onClick={() => goPhase(endPhase)}
                >
                  Iteration {iter + 1}
                  <span>
                    phases {iter * 2}–{endPhase} · {sorted ? "sorted" : "not sorted"}
                  </span>
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              className={lastPhase ? styles.stripOn : undefined}
              onClick={() => goPhase(run.phases.length - 1)}
            >
              Stop
              <span>
                phase {k} &lt; {k}? no
              </span>
            </button>
          </li>
        </ol>
      </details>

      <details className="fold">
        <summary>Check yourself · best {best}/1</summary>
        <p>
          Start packed = [0.10, 0.20, 0.40, 0.55, 0.70, 0.95]. Click every pair
          that will swap on even phase 0 (left_score strictly less than
          right_score).
        </p>
        <div className={styles.guessRow}>
          {[
            { left: 0, right: 1, a: 0.1, b: 0.2 },
            { left: 2, right: 3, a: 0.4, b: 0.55 },
            { left: 4, right: 5, a: 0.7, b: 0.95 },
          ].map((pair) => (
            <button
              type="button"
              key={pair.left}
              className={`${styles.guess} ${guess.has(pair.left) ? styles.picked : ""} ${
                submitted && quizPairs.find((item) => item.leftIndex === pair.left)?.swapped
                  ? styles.wasSwap
                  : ""
              }`}
              onClick={() => toggleGuess(pair.left)}
            >
              ({pair.left},{pair.right}) {fmtScore(pair.a)} vs {fmtScore(pair.b)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={submitQuiz}
          disabled={submitted}
        >
          Check pairs
        </button>
        {submitted ? (
          <p className={quizOk ? styles.ok : styles.bad}>
            {quizOk ? "Correct. " : "Not quite. "}
            All three even pairs swap. After this one phase the array is still
            not descending — keep going until phase reaches K = 6.
          </p>
        ) : null}
      </details>
    </div>
  );
}

function Row({
  label,
  values,
  pairs,
  leftover,
  reveal,
  boxRow,
}: {
  label: string;
  values: string[];
  pairs: SwapPair[];
  leftover: number[];
  reveal: boolean;
  boxRow?: boolean;
}) {
  const pairAt = new Map(pairs.map((pair) => [pair.leftIndex, pair]));
  const groups: number[][] = [];
  for (let index = 0; index < values.length; ) {
    const pair = pairAt.get(index);
    if (reveal && pair) {
      groups.push([index, pair.rightIndex]);
      index = pair.rightIndex + 1;
    } else {
      groups.push([index]);
      index += 1;
    }
  }
  return (
    <div className={styles.rowBlock}>
      <div className={styles.rowLabel}>{label}</div>
      <div className={styles.cells}>
        {groups.map((slots) => {
          const pair = slots.length === 2 ? pairAt.get(slots[0]) : undefined;
          return (
            <div
              key={`${label}-${slots.join("-")}`}
              className={pair ? styles.pairGroup : undefined}
            >
              {slots.map((index) => {
                const unpaired = leftover.includes(index);
                const isLeft = pairAt.has(index);
                return (
                  <div
                    key={`${label}-${index}`}
                    className={`${styles.cell} ${boxRow ? styles.boxCell : ""} ${
                      unpaired ? styles.unpaired : ""
                    } ${
                      reveal && pair
                        ? pair.swapped
                          ? styles.willSwap
                          : styles.noSwap
                        : ""
                    }`}
                  >
                    <span className={styles.idx}>{index}</span>
                    <strong>{values[index]}</strong>
                    {reveal && isLeft && pair ? (
                      <span className={styles.bracket}>
                        {pair.swapped ? "swap" : "stay"}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
