import { emptyFast, emptyMain, fillRegs, idleRegisters, logicalFrom, paintLinear, reserve } from "./canvas";
import type { Budget, Grid, Scene } from "./types";
import { NZ_X, nonzeroIndices } from "./verify";

const HITS = nonzeroIndices(NZ_X);
const LINEAR = HITS.rows.map((row, index) => row * 6 + HITS.cols[index]);
const FLAT = NZ_X.flat();

const logical = logicalFrom(NZ_X, "a", "X[4×6]");

function budget(moved: number): Budget {
  return {
    input: 24,
    output: 3,
    pad: 0,
    moved,
    used: moved === 0 ? 0 : 27,
  };
}

function mainOf(count: number, hotFrom = -1, hotTo = -1): Grid {
  let main = paintLinear(emptyMain(), 0, FLAT, "a");
  main = paintLinear(main, 24, Array.from({ length: 24 }, () => null), "a", { markEmpty: true });
  if (count > 0) {
    main = paintLinear(main, 24, LINEAR.slice(0, count), "c", {
      hotFrom,
      hotTo,
      validFrom: 0,
      validTo: count,
    });
  }
  return main;
}

function fastOf(packed: number[], hotRow: number | null): Grid {
  let fast = NZ_X.reduce(
    (grid, row, y) =>
      paintLinear(grid, y * 6, row, "a", hotRow === y ? { hotFrom: 0, hotTo: 6 } : undefined),
    emptyFast(),
  );
  if (packed.length > 0) {
    fast = paintLinear(fast, 24, packed, "c", { hotFrom: 0, hotTo: packed.length });
  }
  if (packed.length < 3) {
    fast = reserve(fast, 24 + packed.length, 3 - packed.length);
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
    formula: "indices where X ≠ 0",
    op: "vcompress",
    constraint: "fast out = 3",
    logical,
    budget: budget(0),
    main,
    fast: emptyFast(),
    regs: idleRegisters(),
    alu: null,
    avl: 24,
    vl: 0,
    ...extra,
  };
}

function scan(row: number, offset: number) {
  const values = NZ_X[row].slice(offset, offset + 3);
  return {
    regs: fillRegs([
      { index: 0, values, tone: "a" as const, vl: 3 },
      { index: 1, values: [offset, offset + 1, offset + 2], tone: "b" as const, vl: 3 },
    ]),
    alu: values.map((value, index) => ({
      label: `lane ${index}`,
      expr: String(value),
      result: value === 0 ? "drop" : `(${row}, ${offset + index})`,
    })),
  };
}

const scalar: Scene[] = [
  beat("nz-goal", "Find nonzero indices", "N is unknown  max = 24", "dram", mainOf(0), {
    logical: undefined,
    budget: undefined,
  }),
  ...LINEAR.map((index, hit) =>
    beat(`nz-s${hit}`, `Keep index ${hit}`, `(${HITS.rows[hit]}, ${HITS.cols[hit]}) = ${index}`, "alu", mainOf(hit + 1, hit, hit + 1), {
      logical: undefined,
      budget: undefined,
      constraint: `valid ${hit + 1} / 24`,
    }),
  ),
];

const row0 = scan(0, 0);
const row0b = scan(0, 3);
const row1 = scan(1, 0);
const row1b = scan(1, 3);

export const nonzeroDeck = {
  scalar,
  tiling: [
    beat("nz-shape", "Tensor four by six", "max N = 24  fast buffer = 3", "dram", mainOf(0)),
    beat("nz-budget", "Buffer width three", "36 - 3 = 33 → move 24", "dram", mainOf(0)),
    beat("nz-move", "Move whole tensor", "moved 24  used 27/36", "vm", mainOf(0), {
      budget: budget(24),
      fast: fastOf([], null),
    }),
    beat("nz-row0a", "Scan first strip", "mask = [0, 1, 0]", "reg", mainOf(0), {
      budget: budget(24),
      fast: fastOf([], 0),
      ...row0,
      vl: 3,
    }),
    beat("nz-row0b", "Scan row tail", "mask = [1, 0, 1]", "reg", mainOf(0), {
      budget: budget(24),
      fast: fastOf([LINEAR[0]], 0),
      ...row0b,
      vl: 3,
    }),
    beat("nz-pack", "Buffer is full", `fast = [${LINEAR.slice(0, 3).join(", ")}]`, "vm", mainOf(0), {
      budget: budget(24),
      fast: fastOf(LINEAR.slice(0, 3), null),
      full: true,
      vl: 3,
    }),
    beat("nz-flush", "Flush full buffer", "main[0..2] ← fast  valid = 3", "writeback", mainOf(3, 0, 3), {
      budget: budget(24),
      fast: fastOf([], null),
      mark: "flush",
      constraint: "valid 3 / 24",
    }),
    beat("nz-row1a", "Scan next strip", "mask = [1, 0, 0]", "reg", mainOf(3), {
      budget: budget(24),
      fast: fastOf([], 1),
      ...row1,
      constraint: "valid 3 / 24",
      vl: 3,
    }),
    beat("nz-row1b", "Scan next tail", "mask = [1, 0, 0]", "reg", mainOf(3), {
      budget: budget(24),
      fast: fastOf([LINEAR[3]], 1),
      ...row1b,
      constraint: "valid 3 / 24",
      vl: 3,
    }),
    beat("nz-pack2", "Two indices left", `fast = [${LINEAR.slice(3).join(", ")}]`, "vm", mainOf(3), {
      budget: budget(24),
      fast: fastOf(LINEAR.slice(3), null),
      constraint: "valid 3 / 24",
      vl: 2,
    }),
    beat("nz-tail", "Flush the tail", "main[3..4] ← fast  valid = 5", "writeback", mainOf(5, 3, 5), {
      budget: budget(24),
      fast: fastOf([], null),
      mark: "flush",
      constraint: "valid 5 / 24",
    }),
  ],
};
