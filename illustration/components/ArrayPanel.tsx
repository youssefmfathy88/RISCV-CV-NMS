"use client";

import { fmtNum, fmtScore } from "@/lib/format";
import type { Box, SelectedRow } from "@/lib/nms";
import type { NmsSnapshot } from "@/lib/trace";
import styles from "./ArrayPanel.module.css";

type Props = {
  boxes: Box[];
  scores: number[][];
  classNames: string[];
  snapshot: NmsSnapshot;
  selectedBox: number | null;
  onSelectBox: (index: number | null) => void;
  viewClass: number | "all";
};

function cellClass(
  boxIndex: number,
  selectedBox: number | null,
  highlight: number[],
  current: number | null,
): string {
  const bits = [styles.cell];
  if (selectedBox === boxIndex) {
    bits.push(styles.picked);
  }
  if (current === boxIndex) {
    bits.push(styles.current);
  } else if (highlight.includes(boxIndex)) {
    bits.push(styles.hl);
  }
  return bits.join(" ");
}

export default function ArrayPanel({
  boxes,
  scores,
  classNames,
  snapshot,
  selectedBox,
  onSelectBox,
  viewClass,
}: Props) {
  const click = (index: number) => {
    onSelectBox(selectedBox === index ? null : index);
  };

  return (
    <div className={styles.stack}>
      <section>
        <h3>boxes memory <span className={styles.hint}>[y1, x1, y2, x2]</span></h3>
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
                <tr
                  key={index}
                  className={cellClass(
                    index,
                    selectedBox,
                    snapshot.highlightBoxes,
                    snapshot.currentBox,
                  )}
                  onClick={() => click(index)}
                >
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

      <section>
        <h3>scores <span className={styles.hint}>[class][box]</span></h3>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>class</th>
                {boxes.map((_, index) => (
                  <th key={index}>box {index}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scores.map((row, cls) => (
                <tr
                  key={cls}
                  className={
                    viewClass !== "all" && viewClass !== cls
                      ? styles.dimRow
                      : snapshot.cls === cls
                        ? styles.activeRow
                        : undefined
                  }
                >
                  <td>
                    <span className={`tag class${cls % 2}`}>
                      {cls} {classNames[cls]}
                    </span>
                  </td>
                  {row.map((score, index) => (
                    <td
                      key={index}
                      className={cellClass(
                        index,
                        selectedBox,
                        snapshot.highlightBoxes,
                        snapshot.currentBox,
                      )}
                      onClick={() => click(index)}
                    >
                      {fmtScore(score)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3>
          order
          <span className={styles.hint}>
            candidate_count = {snapshot.candidateCount}
          </span>
        </h3>
        <div className={styles.chips}>
          {snapshot.order.length === 0 ? (
            <span className={styles.empty}>empty</span>
          ) : (
            snapshot.order.map((boxIndex, slot) => (
              <button
                type="button"
                key={`order-${slot}-${boxIndex}`}
                className={`${styles.chip} ${cellClass(
                  boxIndex,
                  selectedBox,
                  snapshot.highlightBoxes,
                  snapshot.currentBox,
                )}`}
                onClick={() => click(boxIndex)}
              >
                <span className={styles.slot}>[{slot}]</span>
                <strong>box {boxIndex}</strong>
              </button>
            ))
          )}
        </div>
      </section>

      <section>
        <h3>packed_scores</h3>
        <div className={styles.chips}>
          {snapshot.packedScores.length === 0 ? (
            <span className={styles.empty}>empty</span>
          ) : (
            snapshot.packedScores.map((score, slot) => (
              <button
                type="button"
                key={`packed-${slot}`}
                className={`${styles.chip} ${cellClass(
                  snapshot.order[slot] ?? -1,
                  selectedBox,
                  snapshot.highlightBoxes,
                  snapshot.currentBox,
                )}`}
                onClick={() => {
                  const box = snapshot.order[slot];
                  if (box !== undefined) {
                    click(box);
                  }
                }}
              >
                <span className={styles.slot}>[{slot}]</span>
                <strong>{fmtScore(score)}</strong>
              </button>
            ))
          )}
        </div>
      </section>

      <section>
        <h3>
          suppressed
          <span className={styles.hint}>
            {snapshot.cls === null
              ? "same slots as order[] · 1 = dead"
              : `${classNames[snapshot.cls] ?? `class ${snapshot.cls}`} · same slots as order[]`}
          </span>
        </h3>
        <div className={styles.chips}>
          {snapshot.order.map((boxIndex, slot) => (
            <button
              type="button"
              key={slot}
              className={`${styles.flag} ${(snapshot.suppressed[slot] ?? 0) ? styles.on : ""} ${cellClass(
                boxIndex,
                selectedBox,
                snapshot.highlightBoxes,
                snapshot.currentBox,
              )}`}
              onClick={() => click(boxIndex)}
            >
              [{slot}] box {boxIndex} {snapshot.suppressed[slot] ?? 0}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>
          selected_indices
          <span className={styles.hint}>
            {snapshot.selected.length} rows × [batch, class, box]
          </span>
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
                    className={cellClass(
                      row[2],
                      selectedBox,
                      snapshot.highlightBoxes,
                      snapshot.currentBox,
                    )}
                    onClick={() => click(row[2])}
                  >
                    <td>{i}</td>
                    <td>{row[0]}</td>
                    <td>
                      <span className={`tag class${row[1] % 2}`}>
                        {row[1]} {classNames[row[1]]}
                      </span>
                    </td>
                    <td>box {row[2]}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
