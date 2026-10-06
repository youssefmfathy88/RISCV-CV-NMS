import { emptyFast, emptyMain, fillRegs, idleRegisters, paintLinear, reserve } from "./canvas";
import { cell, emptyCell, type Budget, type Grid, type Scene } from "./types";
import { MATMUL_A, MATMUL_B, matmul } from "./verify";

const C = matmul(MATMUL_A, MATMUL_B);
const A = MATMUL_A.flat();
const B = MATMUL_B.flat();
const ROWS = 4;

function matrix(name: string, rows: Grid["rows"], lit: boolean): Grid {
  return { name, rows, lit, bracket: "exact" };
}

function productOf(cFilled: number, hot: { row: number; col: number | null } | null): Grid[] {
  const flat = C.flat();
  return [
    matrix(
      "A",
      MATMUL_A.map((row, y) => row.map((value) => cell(value, "a", hot?.row === y))),
      hot != null,
    ),
    matrix(
      "B",
      MATMUL_B.map((row) => row.map((value, x) => cell(value, "b", hot != null && (hot.col == null || hot.col === x)))),
      hot != null,
    ),
    matrix(
      "C",
      C.map((row, y) =>
        row.map((_, x) => {
          const index = y * 3 + x;
          const active = hot?.row === y && (hot.col == null || hot.col === x);
          return index < cFilled ? cell(flat[index], "c", active) : { ...emptyCell(), hot: active };
        }),
      ),
      hot != null,
    ),
  ];
}

function budget(rows: number, moved: number, remainder = false): Budget {
  const input = 9 + rows * 3;
  const output = rows * 3;
  return {
    input,
    output,
    pad: 0,
    moved,
    used: moved === 0 ? 0 : input + output,
    remainder,
  };
}

function mainOf(cFilled: number): Grid {
  let main = paintLinear(emptyMain(), 0, A, "a");
  main = paintLinear(main, 18, B, "b");
  if (cFilled > 0) {
    main = paintLinear(main, 27, C.flat().slice(0, cFilled), "c", { validFrom: 0, validTo: cFilled });
  }
  return main;
}

function fastOf(row: number, rows: number, cFilled: number): Grid {
  let fast = paintLinear(emptyFast(), 0, B, "b", { hotFrom: 0, hotTo: 9 });
  fast = paintLinear(fast, 9, A.slice(row * 3, (row + rows) * 3), "a", { hotFrom: 0, hotTo: 3 });
  const outAt = 9 + rows * 3;
  if (cFilled > 0) {
    fast = paintLinear(fast, outAt, C.flat().slice(row * 3, row * 3 + cFilled), "c");
    if (cFilled < rows * 3) {
      fast = reserve(fast, outAt + cFilled, rows * 3 - cFilled);
    }
  } else {
    fast = reserve(fast, outAt, rows * 3);
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
    formula: "C[r,c] = A[r] · B col c",
    op: "dot",
    constraint: "B stays resident",
    logical: productOf(0, null)[0],
    product: productOf(0, null),
    budget: budget(ROWS, 0),
    main,
    fast: emptyFast(),
    regs: idleRegisters(),
    alu: null,
    avl: 6,
    vl: 0,
    ...extra,
  };
}

function dotExpr(row: number, col: number): string {
  return [0, 1, 2].map((k) => `${MATMUL_A[row][k]}·${MATMUL_B[k][col]}`).join(" + ");
}

function vectorRegs(row: number, withResult: boolean) {
  return fillRegs([
    { index: 0, values: withResult ? C[row] : MATMUL_A[row], tone: withResult ? "c" : "a", vl: 3 },
    { index: 1, values: MATMUL_B[0], tone: "b", vl: 3 },
    { index: 2, values: MATMUL_B[1], tone: "b", vl: 3 },
    { index: 3, values: MATMUL_B[2], tone: "b", vl: 3 },
  ]);
}

function lanes(row: number) {
  return [0, 1, 2].map((col) => ({
    label: `C ${row},${col}`,
    expr: dotExpr(row, col),
    result: String(C[row][col]),
  }));
}

export const matmulDeck = {
  scalar: [] as Scene[],
  tiling: [
    beat("matmul-shape", "A rows and B", "A[6×3]  B[3×3]  C[6×3]", "dram", mainOf(0)),
    beat("matmul-budget", "Four rows fit", "9 + 6R ≤ 36 → R = 4", "dram", mainOf(0)),
    beat("matmul-move", "Move four rows", "moved 21  B stays for 4 rows", "vm", mainOf(0), {
      budget: budget(ROWS, 21),
      fast: fastOf(0, ROWS, 0),
    }),
    beat("matmul-load", "Load row and B", "v0 = A row 0   v1..v3 = B", "reg", mainOf(0), {
      budget: budget(ROWS, 21),
      fast: fastOf(0, ROWS, 0),
      product: productOf(0, { row: 0, col: null }),
      regs: vectorRegs(0, false),
      vl: 3,
    }),
    beat("matmul-alu", "Dot three lanes", `C[0] = [${C[0].join(", ")}]`, "alu", mainOf(0), {
      budget: budget(ROWS, 21),
      fast: fastOf(0, ROWS, 0),
      product: productOf(3, { row: 0, col: null }),
      regs: vectorRegs(0, true),
      alu: lanes(0),
      op: "vfmacc",
      vl: 3,
    }),
    beat("matmul-store", "Store the row", "fast C[0] = 2 1 2", "vm", mainOf(0), {
      budget: budget(ROWS, 21),
      fast: fastOf(0, ROWS, 3),
      product: productOf(3, { row: 0, col: null }),
    }),
    beat("matmul-write", "Write four rows", "C rows 0–3  B was loaded once", "writeback", mainOf(12), {
      budget: budget(ROWS, 21),
      fast: fastOf(0, ROWS, 12),
      product: productOf(12, null),
    }),
    beat("matmul-move2", "Reload B", "moved 15  last two rows", "vm", mainOf(12), {
      budget: budget(2, 15, true),
      fast: fastOf(4, 2, 0),
      product: productOf(12, { row: 4, col: null }),
    }),
    beat("matmul-load2", "Load row four", "v0 = A row 4   B reloads", "reg", mainOf(12), {
      budget: budget(2, 15, true),
      fast: fastOf(4, 2, 0),
      product: productOf(12, { row: 4, col: null }),
      regs: vectorRegs(4, false),
      vl: 3,
    }),
    beat("matmul-alu2", "Dot the tail", `C[4] = [${C[4].join(", ")}]`, "alu", mainOf(12), {
      budget: budget(2, 15, true),
      fast: fastOf(4, 2, 0),
      product: productOf(15, { row: 4, col: null }),
      regs: vectorRegs(4, true),
      alu: lanes(4),
      op: "vfmacc",
      vl: 3,
    }),
    beat("matmul-write2", "Write last rows", "C rows 4–5", "writeback", mainOf(18), {
      budget: budget(2, 15, true),
      fast: fastOf(4, 2, 6),
      product: productOf(18, null),
    }),
  ],
};
