import { emptyFast, emptyMain, fillRegs, idleRegisters, logicalFrom, paintLinear, reserve } from "./canvas";
import type { Budget, Grid, Scene } from "./types";
import { SOFTMAX_X, softmaxRow } from "./verify";

const ROWS = SOFTMAX_X.map(softmaxRow);
const FORMULA = "y[i] = exp(x[i] − m) / Σexp(x − m)";
const EQUATION = ["m = max(x)", "e[i] = exp(x[i] − m)", "y[i] = e[i] / sum(e)"];
const TRIP = 3;

const logical = logicalFrom(SOFTMAX_X, "a", "X[4×6]");

function budget(rows: number, moved: number, remainder = false): Budget {
  return {
    input: rows * 6,
    output: rows * 6,
    pad: 0,
    moved,
    used: moved === 0 ? 0 : rows * 12,
    remainder,
  };
}

function flatOut(count: number): string[] {
  return ROWS.flatMap((row) => row.out).slice(0, count);
}

function mainOf(yFilled: number, hotRow: number | null, stage: "x" | "exp" | "y" = "y"): Grid {
  let main = SOFTMAX_X.reduce(
    (grid, row, y) => paintLinear(grid, y * 6, row, "a", hotRow === y ? { hotFrom: 0, hotTo: 6 } : undefined),
    emptyMain(),
  );
  if (yFilled > 0) {
    const values = stage === "exp" ? ROWS[0].exp : flatOut(yFilled);
    main = paintLinear(main, 24, values, "c", { validFrom: 0, validTo: values.length });
  }
  return main;
}

function fastRows(start: number, rows: number, yFilled: number, stage: "reserve" | "exp" | "y"): Grid {
  let fast = paintLinear(emptyFast(), 0, SOFTMAX_X.slice(start, start + rows).flat(), "a", { hotFrom: 0, hotTo: 6 });
  const outAt = rows * 6;
  if (stage === "exp") {
    fast = paintLinear(fast, outAt, ROWS[start].exp, "c");
    fast = reserve(fast, outAt + 6, (rows - 1) * 6);
    return fast;
  }
  if (yFilled > 0) {
    const values = ROWS.slice(start, start + rows)
      .flatMap((row) => row.out)
      .slice(0, yFilled);
    fast = paintLinear(fast, outAt, values, "c");
    if (yFilled < rows * 6) {
      fast = reserve(fast, outAt + yFilled, rows * 6 - yFilled);
    }
  } else {
    fast = reserve(fast, outAt, rows * 6);
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
    formula: FORMULA,
    equation: EQUATION,
    op: "softmax",
    constraint: "whole row stays",
    logical,
    budget: budget(TRIP, 0),
    main,
    fast: emptyFast(),
    regs: idleRegisters(),
    alu: null,
    avl: 6,
    vl: 0,
    ...extra,
  };
}

function expLanes(row: number) {
  const info = ROWS[row];
  return [0, 1, 2].map((index) => ({
    label: `e ${index}`,
    expr: `exp(${SOFTMAX_X[row][index]}−${info.max})`,
    result: info.exp[index],
  }));
}

function divLanes(row: number) {
  const info = ROWS[row];
  return [0, 1, 2].map((index) => ({
    label: `y ${index}`,
    expr: `${info.exp[index]} / ${info.sum}`,
    result: info.out[index],
  }));
}

const head = ROWS[0];

export const softmaxDeck = {
  scalar: [] as Scene[],
  tiling: [
    beat("softmax-shape", "Four by six", "X[4×6] → Y[4×6]", "dram", mainOf(0, null)),
    beat("softmax-budget", "Three rows fit", "12R ≤ 36 → R = 3", "dram", mainOf(0, null)),
    beat("softmax-move", "Move three rows", "moved 18  used 36/36", "vm", mainOf(0, 0), {
      budget: budget(TRIP, 18),
      fast: fastRows(0, TRIP, 0, "reserve"),
    }),
    beat("softmax-load", "Load two strips", "VL=3  row 0 is two strips", "reg", mainOf(0, 0), {
      budget: budget(TRIP, 18),
      fast: fastRows(0, TRIP, 0, "reserve"),
      regs: fillRegs([
        { index: 0, values: SOFTMAX_X[0].slice(0, 3), tone: "a", vl: 3 },
        { index: 1, values: SOFTMAX_X[0].slice(3), tone: "a", vl: 3 },
      ]),
      vl: 3,
    }),
    beat("softmax-max", "Max two strips", `m = max(3, 3) = ${head.max}`, "alu", mainOf(0, 0), {
      budget: budget(TRIP, 18),
      fast: fastRows(0, TRIP, 0, "reserve"),
      regs: fillRegs([
        { index: 0, values: SOFTMAX_X[0].slice(0, 3), tone: "a", vl: 3 },
        { index: 1, values: SOFTMAX_X[0].slice(3), tone: "a", vl: 3 },
      ]),
      alu: [
        { label: "strip 0", expr: "max(1, 2, 3)", result: "3" },
        { label: "strip 1", expr: "max(1, 2, 3)", result: "3" },
        { label: "m", expr: "max(3, 3)", result: "3" },
      ],
      acc: { name: "m", text: String(head.max), hot: true },
      op: "vfmax",
      vl: 3,
    }),
    beat("softmax-exp", "Exp first strip", `e[0..2] = ${head.exp.slice(0, 3).join(" ")}`, "alu", mainOf(0, 0), {
      budget: budget(TRIP, 18),
      fast: fastRows(0, TRIP, 0, "exp"),
      regs: fillRegs([{ index: 0, values: head.exp.slice(0, 3), tone: "c", vl: 3 }]),
      alu: expLanes(0),
      acc: { name: "s", text: head.sum, hot: true },
      op: "vfexp",
      vl: 3,
    }),
    beat("softmax-div", "Divide by sum", `y[i] = e[i] / ${head.sum}`, "alu", mainOf(0, 0), {
      budget: budget(TRIP, 18),
      fast: fastRows(0, TRIP, 3, "y"),
      regs: fillRegs([{ index: 0, values: head.out.slice(0, 3), tone: "c", vl: 3 }]),
      alu: divLanes(0),
      acc: { name: "s", text: head.sum, hot: true },
      op: "vfdiv",
      vl: 3,
    }),
    beat("softmax-write", "Write three rows", "Y rows 0–2", "writeback", mainOf(18, null), {
      budget: budget(TRIP, 18),
      fast: fastRows(0, TRIP, 18, "y"),
    }),
    beat("softmax-move2", "Move the remainder", "moved 6  used 12/36", "vm", mainOf(18, 3), {
      budget: budget(1, 6, true),
      fast: fastRows(3, 1, 0, "reserve"),
    }),
    beat("softmax-div2", "Divide last row", `y[i] = exp(x[i]−${ROWS[3].max}) / ${ROWS[3].sum}`, "alu", mainOf(18, 3), {
      budget: budget(1, 6, true),
      fast: fastRows(3, 1, 3, "y"),
      regs: fillRegs([{ index: 0, values: ROWS[3].out.slice(0, 3), tone: "c", vl: 3 }]),
      alu: divLanes(3),
      acc: { name: "s", text: ROWS[3].sum, hot: true },
      op: "vfdiv",
      vl: 3,
    }),
    beat("softmax-write2", "Write last row", "Y row 3", "writeback", mainOf(24, 3), {
      budget: budget(1, 6, true),
      fast: fastRows(3, 1, 6, "y"),
    }),
  ],
};
