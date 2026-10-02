"use client";

import { fmtScore } from "@/lib/format";
import { boxRect, displayRect, intersectionRect, viewBoxAttr, worldViewForCluster } from "@/lib/geometry";
import type { Box } from "@/lib/nms";
import type { SceneObject } from "@/lib/scenes";
import styles from "./SceneCanvas.module.css";

export type BoxState =
  | "pending"
  | "dropped"
  | "candidate"
  | "current"
  | "kept"
  | "suppressed";

export type BoxVisual = {
  index: number;
  state: BoxState;
  keptClasses: number[];
  pairRole?: "a" | "b" | "intersection";
};

/** IoU-suppressed and score-dropped boxes leave the image (no dotted outlines). */
function isRemovedFromImage(
  state: BoxState | undefined,
  index: number,
  pairHighlight?: [number, number] | null,
): boolean {
  if (state !== "suppressed" && state !== "dropped") {
    return false;
  }
  // Keep both sides visible for the active IoU compare step.
  if (
    pairHighlight &&
    (pairHighlight[0] === index || pairHighlight[1] === index)
  ) {
    return false;
  }
  return true;
}

type Props = {
  boxes: Box[];
  objects: SceneObject[];
  visuals: BoxVisual[];
  scores: number[][];
  classNames: string[];
  selectedBox: number | null;
  onSelectBox: (index: number | null) => void;
  caption?: string;
  pairHighlight?: [number, number] | null;
  intersection?: { x: number; y: number; width: number; height: number } | null;
};

function clusterIndex(box: Box, objects: SceneObject[]): number {
  if (objects.length === 0) {
    return 0;
  }
  const cy = (box[0] + box[2]) / 2;
  const cx = (box[1] + box[3]) / 2;
  let best = 0;
  let bestD = Infinity;
  objects.forEach((object, index) => {
    const oy = (object.box[0] + object.box[2]) / 2;
    const ox = (object.box[1] + object.box[3]) / 2;
    const d = (cy - oy) ** 2 + (cx - ox) ** 2;
    if (d < bestD) {
      bestD = d;
      best = index;
    }
  });
  return best;
}

function ticks(min: number, max: number, count: number): number[] {
  const span = max - min;
  if (span <= 0) {
    return [min];
  }
  const step = niceStep(span / count);
  const start = Math.ceil(min / step) * step;
  const values: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) {
    values.push(Number(v.toFixed(6)));
  }
  return values;
}

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const err = raw / pow;
  if (err >= 5) {
    return 5 * pow;
  }
  if (err >= 2) {
    return 2 * pow;
  }
  return pow;
}

/** Monospace advance in ems. Used to size chips without measuring the DOM. */
const MONO_EM = 0.62;

function detectionLabel(
  index: number,
  scores: number[][],
  keptClasses: number[],
): string {
  const parts = [`#${index}`, ...scores.map((row) => fmtScore(row[index]))];
  if (keptClasses.length) {
    parts.push(keptClasses.join("+"));
  }
  return parts.join("  ");
}

function textWidth(text: string, fontSize: number): number {
  return fontSize * MONO_EM * text.length;
}

/** Drop labels that would leave the frame or collide with a neighbor. */
function fitAlong(
  values: number[],
  min: number,
  max: number,
  fontSize: number,
  format: (value: number) => string,
  axis: "x" | "y",
): number[] {
  const margin = fontSize * 0.2;
  const gap = fontSize * 0.35;
  const kept: number[] = [];
  let edge = -Infinity;
  for (const value of values) {
    const half =
      axis === "x" ? textWidth(format(value), fontSize) / 2 : fontSize * 0.7;
    const start = value - half;
    const end = value + half;
    if (start < min + margin || end > max - margin) {
      continue;
    }
    if (kept.length > 0 && start < edge + gap) {
      continue;
    }
    kept.push(value);
    edge = end;
  }
  return kept;
}

function Person({ box, stroke }: { box: Box; stroke: number }) {
  const r = boxRect(box);
  const cx = r.x + r.width / 2;
  const head = r.height * 0.16;
  return (
    <g className={styles.object} strokeWidth={stroke}>
      <circle cx={cx} cy={r.y + head * 1.2} r={head * 0.7} />
      <line
        x1={cx}
        y1={r.y + head * 2}
        x2={cx}
        y2={r.y + r.height * 0.62}
      />
      <line
        x1={r.x + r.width * 0.2}
        y1={r.y + r.height * 0.4}
        x2={r.x + r.width * 0.8}
        y2={r.y + r.height * 0.4}
      />
      <line
        x1={cx}
        y1={r.y + r.height * 0.62}
        x2={r.x + r.width * 0.28}
        y2={r.y + r.height * 0.92}
      />
      <line
        x1={cx}
        y1={r.y + r.height * 0.62}
        x2={r.x + r.width * 0.72}
        y2={r.y + r.height * 0.92}
      />
    </g>
  );
}

function Vehicle({ box, stroke }: { box: Box; stroke: number }) {
  const r = boxRect(box);
  const y = r.y + r.height * 0.38;
  const h = r.height * 0.32;
  const wheel = Math.min(r.width, r.height) * 0.1;
  return (
    <g className={styles.object} strokeWidth={stroke}>
      <rect
        x={r.x + r.width * 0.12}
        y={y}
        width={r.width * 0.76}
        height={h}
        rx={h * 0.15}
      />
      <rect
        x={r.x + r.width * 0.28}
        y={y - h * 0.55}
        width={r.width * 0.4}
        height={h * 0.55}
        rx={h * 0.12}
      />
      <circle cx={r.x + r.width * 0.3} cy={y + h} r={wheel} />
      <circle cx={r.x + r.width * 0.7} cy={y + h} r={wheel} />
    </g>
  );
}

function Blob({
  box,
  label,
  font,
}: {
  box: Box;
  label: string;
  font: number;
}) {
  const r = boxRect(box);
  return (
    <g className={styles.object} strokeWidth={font * 0.12}>
      <ellipse
        cx={r.x + r.width / 2}
        cy={r.y + r.height / 2}
        rx={r.width * 0.38}
        ry={r.height * 0.38}
      />
      <text
        x={r.x + r.width / 2}
        y={r.y + r.height / 2}
        fontSize={font * 0.7}
        className={styles.objectLabel}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {label}
      </text>
    </g>
  );
}

export default function SceneCanvas({
  boxes,
  objects,
  visuals,
  scores,
  classNames,
  selectedBox,
  onSelectBox,
  caption,
  pairHighlight,
  intersection,
}: Props) {
  const clusters = objects.length > 0 ? objects : null;

  const panels = (clusters ?? [{ kind: "blob", classId: 0, box: boxes[0], label: "scene" }]).map(
    (object, cluster) => {
      const members = boxes
        .map((box, index) => ({ box, index }))
        .filter(({ box }) =>
          clusters ? clusterIndex(box, objects) === cluster : true,
        );
      const viewBoxes = [
        object.box,
        ...members.map((member) => member.box),
      ];
      const view = worldViewForCluster(viewBoxes);
      const stroke = Math.max(view.width, view.height) * 0.01;
      const font = Math.min(view.width, view.height) * 0.085;
      const tickFont = font * 0.55;
      const labels = members.map(({ index }) =>
        detectionLabel(index, scores, visuals[index]?.keptClasses ?? []),
      );
      const longest = labels.reduce((n, label) => Math.max(n, label.length), 4);
      const maxChipW = Math.max(view.width - font * 0.5, font * 2);
      const naturalW = font * (1.15 + longest * MONO_EM);
      const chipScale = naturalW > maxChipW ? maxChipW / naturalW : 1;
      const chipFont = font * chipScale;
      const chipW = naturalW * chipScale;
      const chipH = chipFont * 1.62;
      const chipGap = chipFont * 0.28;
      return {
        object,
        members,
        view,
        stroke,
        font,
        tickFont,
        chipFont,
        chipW,
        chipH,
        chipGap,
        cluster,
      };
    },
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.legend}>
        <span className={styles.axisNote}>
          Image axes: y down, x right. Box = <code>[y1, x1, y2, x2]</code>
        </span>
        <span className={`${styles.swatch} ${styles.kept}`}>kept</span>
        <span className={`${styles.swatch} ${styles.current}`}>current</span>
        <span className={styles.axisNote}>
          suppressed / score-drop → removed from the image
        </span>
        <span className={styles.scoreHint}>
          <span className={styles.score0}>teal score</span>
          {classNames.length > 1 ? (
            <>
              {" = class 0 · "}
              <span className={styles.score1}>orange score</span>
              {" = class 1"}
            </>
          ) : (
            ` = ${classNames[0] ?? "class 0"}`
          )}
        </span>
      </div>
      <div
        className={styles.panels}
        style={{ gridTemplateColumns: `repeat(${Math.min(panels.length, 3)}, minmax(0, 1fr))` }}
      >
        {panels.map(({ object, members, view, stroke, font, tickFont, chipFont, chipW, chipH, chipGap, cluster }) => (
          <div key={cluster} className={styles.panel}>
            <div className={styles.panelTitle}>
              {object.label}
              <span className={`tag class${object.classId % 2}`}>
                {classNames[object.classId] ?? `class ${object.classId}`}
              </span>
            </div>
            <svg
              className={styles.svg}
              viewBox={viewBoxAttr(view)}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`${object.label} detections`}
              letterSpacing="0"
            >
              <defs>
                <pattern
                  id={`grid-${cluster}`}
                  width={niceStep(view.width / 8)}
                  height={niceStep(view.height / 8)}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d={`M ${niceStep(view.width / 8)} 0 L 0 0 0 ${niceStep(view.height / 8)}`}
                    fill="none"
                    stroke="var(--grid-stroke)"
                    strokeWidth={stroke * 0.25}
                  />
                </pattern>
              </defs>
              <rect
                x={view.minX}
                y={view.minY}
                width={view.width}
                height={view.height}
                fill={`url(#grid-${cluster})`}
              />
              {ticks(view.minX, view.minX + view.width, 4).map((x) => (
                <line
                  key={`x-line-${x}`}
                  x1={x}
                  y1={view.minY}
                  x2={x}
                  y2={view.minY + view.height}
                  className={styles.axis}
                  strokeWidth={stroke * 0.15}
                />
              ))}
              {fitAlong(
                ticks(view.minX, view.minX + view.width, 4),
                view.minX,
                view.minX + view.width,
                tickFont,
                (x) => `x=${x}`,
                "x",
              ).map((x) => (
                <text
                  key={`x-${x}`}
                  x={x}
                  y={view.minY + view.height - tickFont * 0.35}
                  fontSize={tickFont}
                  className={styles.tick}
                  textAnchor="middle"
                  letterSpacing="0"
                >
                  x={x}
                </text>
              ))}
              {fitAlong(
                ticks(view.minY, view.minY + view.height, 4),
                view.minY,
                view.minY + view.height - tickFont * 1.5,
                tickFont,
                (y) => `y=${y}`,
                "y",
              ).map((y) => (
                <text
                  key={`y-${y}`}
                  x={view.minX + tickFont * 1.15}
                  y={y}
                  fontSize={tickFont}
                  className={styles.tick}
                  dominantBaseline="middle"
                  letterSpacing="0"
                >
                  y={y}
                </text>
              ))}
              {object.kind === "person" ? (
                <Person box={object.box} stroke={stroke} />
              ) : null}
              {object.kind === "vehicle" ? (
                <Vehicle box={object.box} stroke={stroke} />
              ) : null}
              {object.kind === "blob" ? (
                <Blob box={object.box} label={object.label} font={font} />
              ) : null}
              {members
                .filter(
                  ({ index }) =>
                    !isRemovedFromImage(visuals[index]?.state, index, pairHighlight),
                )
                .flatMap((left, i, visible) =>
                visible.slice(i + 1).map((right) => {
                  const overlap = intersectionRect(left.box, right.box);
                  if (!overlap) {
                    return null;
                  }
                  return (
                    <rect
                      key={`overlap-${left.index}-${right.index}`}
                      x={overlap.x}
                      y={overlap.y}
                      width={overlap.width}
                      height={overlap.height}
                      className={styles.overlap}
                    />
                  );
                }),
              )}
              {intersection && members.some((m) => m.index === pairHighlight?.[0]) ? (
                <rect
                  x={intersection.x}
                  y={intersection.y}
                  width={intersection.width}
                  height={intersection.height}
                  className={styles.intersection}
                />
              ) : null}
              {members
                .filter(
                  ({ index }) =>
                    !isRemovedFromImage(visuals[index]?.state, index, pairHighlight),
                )
                .map(({ box, index }, slot) => {
                const visual = visuals[index];
                const r = boxRect(box);
                const drawn = displayRect(box, slot);
                const selected = selectedBox === index;
                const pair =
                  pairHighlight &&
                  (pairHighlight[0] === index || pairHighlight[1] === index);
                const inset = font * 0.18;
                const chipX = Math.min(
                  Math.max(view.minX + inset, r.x),
                  view.minX + view.width - chipW - inset,
                );
                const chipY = view.minY + inset + slot * (chipH + chipGap);
                return (
                  <g
                    key={index}
                    className={`${styles.box} ${styles[`boxId${index % 6}`]} ${styles[visual?.state ?? "pending"]} ${selected ? styles.selected : ""} ${pair ? styles.pair : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectBox(selected ? null : index);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        onSelectBox(selected ? null : index);
                      }
                    }}
                  >
                    <rect
                      className={styles.outline}
                      x={drawn.x}
                      y={drawn.y}
                      width={drawn.width}
                      height={drawn.height}
                      rx={0}
                    />
                    <g className={styles.chip}>
                      <rect
                        x={chipX}
                        y={chipY}
                        width={chipW}
                        height={chipH}
                        rx={chipH * 0.22}
                      />
                      <text
                        x={chipX + chipW / 2}
                        y={chipY + chipH * 0.72}
                        fontSize={chipFont}
                        textAnchor="middle"
                        letterSpacing="0"
                      >
                        <tspan className={styles.boxLabel}>#{index}</tspan>
                        {scores.map((row, cls) => (
                          <tspan
                            key={cls}
                            className={cls === 0 ? styles.score0 : styles.score1}
                          >
                            {`  ${fmtScore(row[index])}`}
                          </tspan>
                        ))}
                        {visual?.keptClasses.length ? (
                          <tspan className={styles.boxLabel}>
                            {`  ${visual.keptClasses.join("+")}`}
                          </tspan>
                        ) : null}
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>
          </div>
        ))}
      </div>
      {caption ? <p className={styles.caption}>{caption}</p> : null}
    </div>
  );
}
