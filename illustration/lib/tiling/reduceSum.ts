import { emptyFast, emptyMain, fillRegs, idleRegisters, logicalFrom, paintLinear, reserve } from "./canvas";
import type { Budget, Grid, Scene } from "./types";
import { REDUCE_X, reduceInner } from "./verify";

const SUMS = reduceInner(REDUCE_X);
const FLAT = REDUCE_X.flat();
const ROWS = 5;

const logical = logicalFrom(REDUCE_X, "a", "X[6×6]");

function budget(moved: number, rows: number, remainder = false): Budget {
  return {
    input: rows * 6,
    output: rows,
    pad: 0,
    moved,
    used: moved === 0 ? 0 : rows * 6 + rows,
    remainder,
  };
}

function mainOf(sumsFilled: number, hotRow: number | null): Grid {
  let main = REDUCE_X.reduce(
    (grid, row, y) => paintLinear(grid, y * 6, row, "a", hotRow === y ? { hotFrom: 0, hotTo: 6 } : undefined),
    emptyMain(),
  );
  if (sumsFilled > 0) {
    main = paintLinear(main, 36, SUMS.slice(0, sumsFilled), "c", { validFrom: 0, validTo: sumsFilled });
  }
  return main;
}

function fastRows(start: number, rows: number, sumsFilled: number): Grid {
  let fast = paintLinear(emptyFast(), 0, FLAT.slice(start * 6, (start + rows) * 6), "a", { hotFrom: 0, hotTo: 6 });
  if (sumsFilled > 0) {
    fast = paintLinear(fast, rows * 6, SUMS.slice(start, start + sumsFilled), "c", { hotFrom: 0, hotTo: 1 });
    if (sumsFilled < rows) {
      fast = reserve(fast, rows * 6 + sumsFilled, rows - sumsFilled);
    }
  } else {
    fast = reserve(fast, rows * 6, rows);
  }
  return fast;
}

function beat(
  id: string,
  title: string,
  changed: string,
  hop: Scene["hop"],
  main: Grid,
  extra?: Partial<Scene>,
): Scene {
  return {
    id,
    title,
    changed,
    hop,
    formula: "sum[row] = Σ X[row, i]",
    op: "vredsum.vs",
    constraint: "whole inner row",
    logical,
    budget: budget(0, ROWS),
    main,
    fast: emptyFast(),
    regs: idleRegisters(),
    alu: null,
    avl: 6,
    vl: 0,
    ...extra,
  };
}

function stripRegs(row: number, offset: number) {
  return fillRegs([{ index: 0, values: REDUCE_X[row].slice(offset, offset + 3), tone: "a", vl: 3 }]);
}

const scalar: Scene[] = [
  beat("reduce-goal", "Sum each row", "6 rows → 6 sums", "dram", mainOf(0, null), {
    logical: undefined,
    budget: undefined,
  }),
  ...SUMS.map((total, row) =>
    beat(`reduce-s${row}`, `Sum row ${row}`, `sum[${row}] = ${total}`, "alu", mainOf(row + 1, row), {
      logical: undefined,
      budget: undefined,
      alu: [{ label: `row ${row}`, expr: REDUCE_X[row].join("+"), result: String(total) }],
      acc: { name: "acc", text: String(total), hot: true },
    }),
  ),
];

const head = REDUCE_X[0].slice(0, 3).reduce((sum, value) => sum + value, 0);
const tail = REDUCE_X[0].slice(3).reduce((sum, value) => sum + value, 0);
const lastHead = REDUCE_X[5].slice(0, 3).reduce((sum, value) => sum + value, 0);
const lastTail = REDUCE_X[5].slice(3).reduce((sum, value) => sum + value, 0);

export const reduceDeck = {
  scalar,
  tiling: [
    beat("reduce-shape", "Matrix six by six", "X[6×6] → sum[6]", "dram", mainOf(0, null)),
    beat("reduce-budget", "Five rows fit", "7R ≤ 36 → R = 5", "dram", mainOf(0, null)),
    beat("reduce-move", "Move five rows", "moved 30  used 35/36", "vm", mainOf(0, 0), {
      budget: budget(30, ROWS),
      fast: fastRows(0, ROWS, 0),
    }),
    beat("reduce-load", "Load first strip", "v0 = X[0, 0..2]  VL=3", "reg", mainOf(0, 0), {
      budget: budget(30, ROWS),
      fast: fastRows(0, ROWS, 0),
      regs: stripRegs(0, 0),
      vl: 3,
    }),
    beat("reduce-alu", "Reduce first strip", `acc = ${head}`, "alu", mainOf(0, 0), {
      budget: budget(30, ROWS),
      fast: fastRows(0, ROWS, 0),
      regs: stripRegs(0, 0),
      alu: REDUCE_X[0].slice(0, 3).map((value, index) => ({
        label: `lane ${index}`,
        expr: String(value),
        result: index === 2 ? String(head) : null,
      })),
      acc: { name: "acc", text: String(head), hot: true },
      vl: 3,
    }),
    beat("reduce-tail", "Finish row 0", `acc = ${head} + ${tail} = ${SUMS[0]}`, "alu", mainOf(0, 0), {
      budget: budget(30, ROWS),
      fast: fastRows(0, ROWS, 0),
      regs: stripRegs(0, 3),
      alu: REDUCE_X[0].slice(3).map((value, index) => ({
        label: `lane ${index}`,
        expr: String(value),
        result: index === 2 ? String(SUMS[0]) : null,
      })),
      acc: { name: "acc", text: String(SUMS[0]), hot: true },
      vl: 3,
    }),
    beat("reduce-store", "Store row sum", `fast sum[0] = ${SUMS[0]}`, "vm", mainOf(0, null), {
      budget: budget(30, ROWS),
      fast: fastRows(0, ROWS, 1),
    }),
    beat("reduce-write", "Write five sums", "row 0 shown · sums[0..4]", "writeback", mainOf(ROWS, null), {
      budget: budget(30, ROWS),
      fast: fastRows(0, ROWS, ROWS),
    }),
    beat("reduce-move2", "Move the remainder", "moved 6  used 7/36", "vm", mainOf(ROWS, 5), {
      budget: budget(6, 1, true),
      fast: fastRows(5, 1, 0),
    }),
    beat("reduce-load2", "Load last row", "v0 = X[5, 0..2]  VL=3", "reg", mainOf(ROWS, 5), {
      budget: budget(6, 1, true),
      fast: fastRows(5, 1, 0),
      regs: stripRegs(5, 0),
      vl: 3,
    }),
    beat("reduce-tail2", "Finish last row", `acc = ${lastHead} + ${lastTail} = ${SUMS[5]}`, "alu", mainOf(ROWS, 5), {
      budget: budget(6, 1, true),
      fast: fastRows(5, 1, 0),
      regs: stripRegs(5, 3),
      alu: REDUCE_X[5].slice(3).map((value, index) => ({
        label: `lane ${index}`,
        expr: String(value),
        result: index === 2 ? String(SUMS[5]) : null,
      })),
      acc: { name: "acc", text: String(SUMS[5]), hot: true },
      vl: 3,
    }),
    beat("reduce-write2", "Write last sum", `sum[5] = ${SUMS[5]}`, "writeback", mainOf(6, 5), {
      budget: budget(6, 1, true),
      fast: fastRows(5, 1, 1),
    }),
  ],
};
