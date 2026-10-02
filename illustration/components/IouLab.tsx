"use client";

import LessonBoard from "@/components/LessonBoard";
import { fmtIou, fmtNum, fmtScore } from "@/lib/format";
import {
  boxRect,
  intersectionRect,
  normalizeBox,
  viewBoxAttr,
  worldViewForBoxes,
} from "@/lib/geometry";
import { iouBreakdown, type Box } from "@/lib/nms";
import { WALKTHROUGH } from "@/lib/scenes";
import { IOU_SCORE_KEY } from "@/lib/quizStorage";
import { useBestScore } from "@/lib/useBestScore";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./IouLab.module.css";

const PAIRS: { label: string; a: number; b: number; hint: string }[] = [
  { label: "box 0 vs 1 (overlap)", a: 0, b: 1, hint: "12/16 = 0.75" },
  { label: "box 3 vs 4 (overlap)", a: 3, b: 4, hint: "12/20 = 0.60" },
  { label: "box 0 vs 3 (far apart)", a: 0, b: 3, hint: "IoU 0" },
  { label: "box 4 vs 5 (overlap)", a: 4, b: 5, hint: "14/18 ≈ 0.78" },
];

const IOU_SNIPPET = `intersection = overlap_y * overlap_x
union = area_a + area_b - intersection
IoU = intersection / union
if (IoU > iou_threshold)
    suppressed[j] = 1;  // j = later sorted slot`;

type Drag = {
  which: "a" | "b";
  corner: "tl" | "br";
};

export default function IouLab() {
  const [a, setA] = useState<Box>(WALKTHROUGH.boxes[0]);
  const [b, setB] = useState<Box>(WALKTHROUGH.boxes[1]);
  const [threshold, setThreshold] = useState(0.5);
  const [pairIndex, setPairIndex] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [best, setBest] = useBestScore(IOU_SCORE_KEY);
  const [challenge, setChallenge] = useState<(boolean | null)[]>([null, null]);

  const loadPair = (index: number) => {
    const pair = PAIRS[index];
    setPairIndex(index);
    setA(WALKTHROUGH.boxes[pair.a]);
    setB(WALKTHROUGH.boxes[pair.b]);
  };

  const view = useMemo(() => worldViewForBoxes([a, b], 0.25), [a, b]);
  const breakdown = iouBreakdown(a, b);
  const inter = intersectionRect(a, b);
  const suppress = breakdown.iou > threshold;
  const stroke = Math.max(view.width, view.height) * 0.012;
  const handle = stroke * 2.2;
  const pair = PAIRS[pairIndex];

  useEffect(() => {
    if (!drag) {
      return;
    }
    const clientToWorld = (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) {
        return null;
      }
      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) {
        return null;
      }
      const mapped = point.matrixTransform(ctm.inverse());
      return { x: mapped.x, y: mapped.y };
    };
    const onMove = (event: PointerEvent) => {
      const world = clientToWorld(event.clientX, event.clientY);
      if (!world) {
        return;
      }
      const apply = (box: Box): Box => {
        const next: Box = [...box];
        if (drag.corner === "tl") {
          next[0] = world.y;
          next[1] = world.x;
        } else {
          next[2] = world.y;
          next[3] = world.x;
        }
        return normalizeBox(next);
      };
      if (drag.which === "a") {
        setA((box) => apply(box));
      } else {
        setB((box) => apply(box));
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag]);

  const answerChallenge = (index: number, yes: boolean) => {
    const expected = [true, false];
    const next = [...challenge];
    next[index] = yes;
    setChallenge(next);
    if (yes === expected[index]) {
      const score = next.filter((value, i) => value === expected[i]).length;
      setBest(score);
    }
  };

  const ra = boxRect(a);
  const rb = boxRect(b);

  return (
    <div className={styles.page}>
      <LessonBoard
        watching={`Boxes ${pair.a} and ${pair.b}. Suppress the later box only if IoU is strictly greater than ${fmtScore(threshold)}.`}
        fn="IoU"
        extraBar={
          <div className={styles.controls}>
            <label>
              Pair from the walkthrough scene
              <select
                value={pairIndex}
                onChange={(event) => loadPair(Number(event.target.value))}
              >
                {PAIRS.map((item, index) => (
                  <option key={item.label} value={index}>
                    {item.label} · {item.hint}
                  </option>
                ))}
              </select>
            </label>
            <label>
              iou_threshold {threshold.toFixed(2)}
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={threshold}
                onChange={(event) => setThreshold(Number(event.target.value))}
              />
            </label>
          </div>
        }
        code={IOU_SNIPPET}
        highlightLine={suppress ? 4 : 2}
        changed={
          suppress
            ? `IoU = ${fmtIou(breakdown.iou)} > ${fmtScore(threshold)} → suppress box ${pair.b} (removed)`
            : `IoU = ${fmtIou(breakdown.iou)} ≤ ${fmtScore(threshold)} → keep both`
        }
        data={
          <div className={styles.dataCol}>
            <svg
              ref={svgRef}
              viewBox={viewBoxAttr(view)}
              className={styles.svg}
            >
              <rect
                x={view.minX}
                y={view.minY}
                width={view.width}
                height={view.height}
                fill="var(--scene-bg)"
              />
              {!suppress && inter ? (
                <rect
                  x={inter.x}
                  y={inter.y}
                  width={inter.width}
                  height={inter.height}
                  className={styles.inter}
                />
              ) : null}
              <g className={styles.boxA}>
                <rect
                  x={ra.x}
                  y={ra.y}
                  width={ra.width}
                  height={ra.height}
                  strokeWidth={stroke}
                />
                <text x={ra.x + stroke} y={ra.y + handle * 2} fontSize={handle * 1.6}>
                  A box {pair.a}
                </text>
                <circle
                  cx={ra.x}
                  cy={ra.y}
                  r={handle}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    setDrag({ which: "a", corner: "tl" });
                  }}
                />
                <circle
                  cx={ra.x + ra.width}
                  cy={ra.y + ra.height}
                  r={handle}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    setDrag({ which: "a", corner: "br" });
                  }}
                />
              </g>
              {!suppress ? (
                <g className={styles.boxB}>
                  <rect
                    x={rb.x}
                    y={rb.y}
                    width={rb.width}
                    height={rb.height}
                    strokeWidth={stroke}
                  />
                  <text x={rb.x + stroke} y={rb.y + handle * 2} fontSize={handle * 1.6}>
                    B box {pair.b}
                  </text>
                  <circle
                    cx={rb.x}
                    cy={rb.y}
                    r={handle}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      setDrag({ which: "b", corner: "tl" });
                    }}
                  />
                  <circle
                    cx={rb.x + rb.width}
                    cy={rb.y + rb.height}
                    r={handle}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      setDrag({ which: "b", corner: "br" });
                    }}
                  />
                </g>
              ) : null}
            </svg>
            <div className={styles.metrics}>
              <div className={styles.metric}>
                <span>intersection</span>
                <strong>{fmtNum(breakdown.intersection)}</strong>
              </div>
              <div className={styles.metric}>
                <span>union</span>
                <strong>{fmtNum(breakdown.union)}</strong>
              </div>
              <div className={`${styles.metric} ${styles.iou}`}>
                <span>IoU</span>
                <strong>
                  {fmtIou(breakdown.iou)}
                  {breakdown.degenerate ? " → 0" : ""}
                </strong>
              </div>
            </div>
            <span className={`tag ${suppress ? "drop" : "keep"}`}>
              {suppress ? "suppressed (removed)" : "keep both"}
            </span>
          </div>
        }
      />

      <details className="fold">
        <summary>How it is computed</summary>
        <pre className={styles.formula}>
          <code>{`overlap_y = max(0, min(y2a, y2b) - max(y1a, y1b))
overlap_x = max(0, min(x2a, x2b) - max(x1a, x1b))
intersection = overlap_y * overlap_x
area_a = (y2a - y1a) * (x2a - x1a)
area_b = (y2b - y1b) * (x2b - x1b)
union = area_a + area_b - intersection
IoU = intersection / union`}</code>
        </pre>
        <ul className={styles.values}>
          <li>
            A {fmtBox(a)} area {fmtNum(breakdown.areaA)}
          </li>
          <li>
            B {fmtBox(b)} area {fmtNum(breakdown.areaB)}
          </li>
          <li>
            overlap_y {fmtNum(breakdown.overlapY)} · overlap_x{" "}
            {fmtNum(breakdown.overlapX)}
          </li>
        </ul>
        <p className={styles.hint}>
          Drag the corner handles. y1 ≤ y2 and x1 ≤ x2 are enforced, matching
          the kernel. Shaded region is the intersection.
        </p>
      </details>

      <details className="fold">
        <summary>Check yourself · best {best}/2</summary>
        <div className={styles.cards}>
          <article>
            <p>
              If NMS keeps box 0, will box 1 be suppressed at 0.5?
            </p>
            <div className={styles.quizBtns}>
              <button type="button" className="btn" onClick={() => answerChallenge(0, true)}>
                Yes, suppress
              </button>
              <button type="button" className="btn" onClick={() => answerChallenge(0, false)}>
                No, keep
              </button>
            </div>
            {challenge[0] !== null ? (
              <p className={challenge[0] === true ? styles.ok : styles.bad}>
                IoU(0,1) = 0.75 &gt; 0.5, so yes. Load pair “box 0 vs 1”.
              </p>
            ) : null}
          </article>
          <article>
            <p>
              If NMS keeps box 0, is box 3 a duplicate at threshold 0.5?
            </p>
            <div className={styles.quizBtns}>
              <button type="button" className="btn" onClick={() => answerChallenge(1, true)}>
                Yes, suppress
              </button>
              <button type="button" className="btn" onClick={() => answerChallenge(1, false)}>
                No, keep
              </button>
            </div>
            {challenge[1] !== null ? (
              <p className={challenge[1] === false ? styles.ok : styles.bad}>
                IoU(0,3) = 0. Distant objects survive. That is why one box from
                each cluster can both be kept (walkthrough: box 5 then box 1).
              </p>
            ) : null}
          </article>
        </div>
      </details>
    </div>
  );
}

function fmtBox(box: Box): string {
  return `[${box.map((value) => fmtNum(value)).join(", ")}]`;
}
