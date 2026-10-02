"use client";

import { fmtIou, fmtNum, fmtScore } from "@/lib/format";
import type { BufferSet } from "@/lib/lesson";
import type { Box, SelectedRow, SwapPair } from "@/lib/nms";
import {
  isIouCompareExtra,
  type NmsSnapshot,
  type TraceStep,
} from "@/lib/trace";
import styles from "./ArrayPanel.module.css";

type GreedyRole = "kept" | "compare" | "suppressed";

type Props = {
  stage: BufferSet;
  boxes: Box[];
  scores: number[][];
  classNames: string[];
  snapshot: NmsSnapshot;
  viewClass: number;
  pairs?: SwapPair[];
  leftover?: number[];
  extra?: TraceStep["extra"];
};

function lit(boxIndex: number, snapshot: NmsSnapshot): string {
  const bits = [styles.cell];
  if (snapshot.currentBox === boxIndex) {
    bits.push(styles.current);
  } else if (snapshot.highlightBoxes.includes(boxIndex)) {
    bits.push(styles.hl);
  }
  return bits.join(" ");
}

function greedyRole(boxIndex: number, snapshot: NmsSnapshot): GreedyRole | null {
  if (snapshot.compareBox === boxIndex) {
    return "compare";
  }
  if (snapshot.keptBox === boxIndex) {
    return "kept";
  }
  const slot = snapshot.order.indexOf(boxIndex);
  if (slot >= 0 && snapshot.suppressed[slot] === 1) {
    return "suppressed";
  }
  return null;
}

function roleClass(role: GreedyRole | null): string {
  if (role === "kept") {
    return styles.roleKept;
  }
  if (role === "compare") {
    return styles.roleCompare;
  }
  if (role === "suppressed") {
    return styles.roleDrop;
  }
  return "";
}

function slotGroups(count: number, pairAt: Map<number, SwapPair>): number[][] {
  const groups: number[][] = [];
  for (let slot = 0; slot < count; ) {
    const pair = pairAt.get(slot);
    if (pair) {
      groups.push([slot, pair.rightIndex]);
      slot = pair.rightIndex + 1;
    } else {
      groups.push([slot]);
      slot += 1;
    }
  }
  return groups;
}

export default function FocusBuffers({
  stage,
  boxes,
  scores,
  classNames,
  snapshot,
  viewClass,
  pairs = [],
  leftover = [],
  extra,
}: Props) {
  const cls = snapshot.cls ?? viewClass;
  const classScores = scores[cls] ?? [];
  const pairAt = new Map(pairs.map((pair) => [pair.leftIndex, pair]));

  return (
    <div className={styles.stack}>
      {stage === "inputs" ? (
        <>
          <section>
            <h3>
              boxes <span className={styles.hint}>[y1, x1, y2, x2]</span>
            </h3>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>i</th>
                    <th>y1</th>
                    <th>x1</th>
                    <th>y2</th>
                    <th>x2</th>
                  </tr>
                </thead>
                <tbody>
                  {boxes.map((box, index) => (
                    <tr key={index} className={lit(index, snapshot)}>
                      <td className={styles.idx}>{index}</td>
                      {box.map((value, k) => (
                        <td key={k}>{fmtNum(value)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <ScoreRow
            cls={cls}
            name={classNames[cls]}
            scores={classScores}
            snapshot={snapshot}
          />
        </>
      ) : null}

      {stage === "score" ? (
        <>
          <ScoreRow
            cls={cls}
            name={classNames[cls]}
            scores={classScores}
            snapshot={snapshot}
          />
          <BufferRow
            label="order"
            hint={`K = ${snapshot.candidateCount}`}
            snapshot={snapshot}
            pairAt={pairAt}
            leftover={leftover}
            showPairs={false}
            values={snapshot.order.map((boxIndex) => ({
              boxIndex,
              primary: `box ${boxIndex}`,
            }))}
          />
          <BufferRow
            label="packed_scores"
            hint="same keep mask as order"
            snapshot={snapshot}
            pairAt={pairAt}
            leftover={leftover}
            showPairs={false}
            values={snapshot.order.map((boxIndex, slot) => ({
              boxIndex,
              primary:
                snapshot.packedScores[slot] !== undefined
                  ? fmtScore(snapshot.packedScores[slot])
                  : "—",
            }))}
          />
        </>
      ) : null}

      {stage === "sort" ? (
        <>
          <BufferRow
            label="order"
            hint={`K = ${snapshot.candidateCount}`}
            snapshot={snapshot}
            pairAt={pairAt}
            leftover={leftover}
            showPairs
            values={snapshot.order.map((boxIndex) => ({
              boxIndex,
              primary: `box ${boxIndex}`,
            }))}
          />
          <BufferRow
            label="packed_scores"
            hint="dense scores, same slots as order"
            snapshot={snapshot}
            pairAt={pairAt}
            leftover={leftover}
            showPairs
            values={snapshot.order.map((boxIndex, slot) => ({
              boxIndex,
              primary:
                snapshot.packedScores[slot] !== undefined
                  ? fmtScore(snapshot.packedScores[slot])
                  : "—",
            }))}
          />
        </>
      ) : null}

      {stage === "greedy" ? (
        <>
          <p className={styles.legend}>
            <span>
              <span className={`${styles.swatch} ${styles.swatchKept}`} /> kept
            </span>
            <span>
              <span className={`${styles.swatch} ${styles.swatchCompare}`} /> vs
            </span>
            <span>
              <span className={`${styles.swatch} ${styles.swatchDrop}`} /> suppressed
            </span>
          </p>
          <BufferRow
            label="order"
            hint={`K = ${snapshot.candidateCount} · values are box ids`}
            snapshot={snapshot}
            pairAt={pairAt}
            leftover={leftover}
            showPairs={false}
            values={snapshot.order.map((boxIndex, slot) => {
              const role = greedyRole(boxIndex, snapshot);
              const iouExtra = isIouCompareExtra(extra) ? extra : null;
              let note: string | undefined;
              if (role === "kept") {
                note = "kept";
              } else if (role === "compare" && iouExtra) {
                if (iouExtra.alreadySuppressed) {
                  note = "skip IoU";
                } else if (iouExtra.breakdown) {
                  note = iouExtra.didSuppress
                    ? `${fmtIou(iouExtra.breakdown.iou)} → drop`
                    : `${fmtIou(iouExtra.breakdown.iou)} → leave`;
                } else {
                  note = "vs";
                }
              } else if (role === "compare") {
                note = "vs";
              } else if (role === "suppressed") {
                note = "dead";
              }
              return {
                boxIndex,
                primary: `box ${boxIndex}`,
                role,
                note: note ? `[${slot}] ${note}` : undefined,
              };
            })}
          />
          <section>
            <h3>
              suppressed
              <span className={styles.hint}>same slots as order[] · 1 = dead</span>
            </h3>
            <div className={styles.chips}>
              {snapshot.order.map((boxIndex, slot) => {
                const flag = snapshot.suppressed[slot] ?? 0;
                const role = greedyRole(boxIndex, snapshot);
                return (
                  <span
                    key={slot}
                    className={`${styles.flag} ${flag ? styles.on : ""} ${roleClass(role)}`}
                  >
                    <span className={styles.slot}>[{slot}] box {boxIndex}</span>
                    <strong>{flag}</strong>
                    {role ? (
                      <span className={styles.hint}>
                        {role === "kept"
                          ? "kept"
                          : role === "compare"
                            ? "vs"
                            : "dead"}
                      </span>
                    ) : null}
                  </span>
                );
              })}
            </div>
          </section>
          <section>
            <h3>
              selected_indices
              <span className={styles.hint}>{snapshot.selected.length} rows</span>
            </h3>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>batch</th>
                    <th>class</th>
                    <th>box</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.selected.length === 0 ? (
                    <tr>
                      <td colSpan={4} className={styles.empty}>
                        none yet
                      </td>
                    </tr>
                  ) : (
                    snapshot.selected.map((row: SelectedRow, i) => (
                      <tr
                        key={`${i}-${row.join("-")}`}
                        className={roleClass(greedyRole(row[2], snapshot)) || lit(row[2], snapshot)}
                      >
                        <td>{i}</td>
                        <td>{row[0]}</td>
                        <td>
                          {row[1]}
                          {classNames[row[1]] ? ` ${classNames[row[1]]}` : ""}
                        </td>
                        <td>box {row[2]}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {stage === "summary" ? (
        <section>
          <h3>
            selected_indices
            <span className={styles.hint}>{snapshot.selected.length} rows</span>
          </h3>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>batch</th>
                  <th>class</th>
                  <th>box</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.selected.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.empty}>
                      none
                    </td>
                  </tr>
                ) : (
                  snapshot.selected.map((row: SelectedRow, i) => (
                    <tr key={`${i}-${row.join("-")}`}>
                      <td>{i}</td>
                      <td>{row[0]}</td>
                      <td>
                        {row[1]}
                        {classNames[row[1]] ? ` ${classNames[row[1]]}` : ""}
                      </td>
                      <td>box {row[2]}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ScoreRow({
  cls,
  name,
  scores,
  snapshot,
}: {
  cls: number;
  name: string;
  scores: number[];
  snapshot: NmsSnapshot;
}) {
  return (
    <section>
      <h3>
        class_scores
        <span className={styles.hint}>
          class {cls} {name}
        </span>
      </h3>
      <div className={styles.chips}>
        {scores.map((score, index) => (
          <span key={index} className={`${styles.chip} ${lit(index, snapshot)}`}>
            <span className={styles.slot}>box {index}</span>
            <strong>{fmtScore(score)}</strong>
          </span>
        ))}
      </div>
    </section>
  );
}

function BufferRow({
  label,
  hint,
  snapshot,
  pairAt,
  leftover,
  showPairs,
  values,
}: {
  label: string;
  hint: string;
  snapshot: NmsSnapshot;
  pairAt: Map<number, SwapPair>;
  leftover: number[];
  showPairs: boolean;
  values: { boxIndex: number; primary: string; role?: GreedyRole | null; note?: string }[];
}) {
  if (values.length === 0) {
    return (
      <section>
        <h3>{label}</h3>
        <span className={styles.empty}>empty</span>
      </section>
    );
  }

  const groups = showPairs ? slotGroups(values.length, pairAt) : values.map((_, slot) => [slot]);

  return (
    <section>
      <h3>
        {label}
        <span className={styles.hint}>{hint}</span>
      </h3>
      <div className={styles.chips}>
        {groups.map((slots) => {
          const pair = slots.length === 2 ? pairAt.get(slots[0]) : undefined;
          return (
            <div
              key={`${label}-${slots.join("-")}`}
              className={pair ? styles.pairGroup : undefined}
            >
              {slots.map((slot) => {
                const value = values[slot];
                const unpaired = leftover.includes(slot);
                const pairClass =
                  showPairs && pair
                    ? pair.swapped
                      ? styles.willSwap
                      : styles.noSwap
                    : "";
                const role = value.role ?? null;
                return (
                  <span
                    key={`${label}-${slot}`}
                    className={`${styles.chip} ${role ? roleClass(role) : lit(value.boxIndex, snapshot)} ${unpaired ? styles.dimRow : ""} ${pairClass}`}
                  >
                    <span className={styles.slot}>
                      {value.note ?? `[${slot}]`}
                    </span>
                    <strong>{value.primary}</strong>
                    {pair && pair.leftIndex === slot ? (
                      <span className={styles.hint}>
                        {pair.swapped ? "swap" : "stay"}
                      </span>
                    ) : null}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
