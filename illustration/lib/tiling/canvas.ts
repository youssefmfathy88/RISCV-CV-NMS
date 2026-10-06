import {
  VLMAX,
  cell,
  emptyCell,
  lanes,
  padCell,
  strip,
  type Cell,
  type CellTone,
  type Grid,
  type Strip,
} from "./types";

export const MAIN_ROWS = 9;
export const MAIN_COLS = 6;
export const FAST_ROWS = 6;
export const FAST_COLS = 6;
export const REG_COUNT = 4;
export const REG_NAMES = ["v0", "v1", "v2", "v3"] as const;
export const VCCM = FAST_ROWS * FAST_COLS;

export function blankGrid(rows: number, cols: number): Grid {
  return {
    name: "",
    rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => emptyCell())),
  };
}

export function emptyMain(): Grid {
  return blankGrid(MAIN_ROWS, MAIN_COLS);
}

export function emptyFast(): Grid {
  return blankGrid(FAST_ROWS, FAST_COLS);
}

export function cloneGrid(grid: Grid): Grid {
  return {
    ...grid,
    rows: grid.rows.map((row) => row.map((item) => ({ ...item }))),
  };
}

export function stamp(
  grid: Grid,
  row: number,
  col: number,
  values: Array<number | string | null>,
  tone: CellTone,
  opts?: { hotFrom?: number; hotTo?: number; pads?: number[]; validFrom?: number; validTo?: number },
): Grid {
  const next = cloneGrid(grid);
  values.forEach((value, offset) => {
    if (value == null) {
      return;
    }
    const hot = opts?.hotFrom != null && offset >= opts.hotFrom && offset < (opts.hotTo ?? values.length);
    const valid = opts?.validFrom != null && offset >= opts.validFrom && offset < (opts.validTo ?? values.length);
    const painted: Cell = opts?.pads?.includes(offset)
      ? padCell(hot)
      : cell(value, tone, hot);
    next.rows[row][col + offset] = { ...painted, valid };
  });
  if (opts?.hotFrom != null) {
    next.lit = true;
  }
  return next;
}

export function paintLinear(
  grid: Grid,
  start: number,
  values: Array<number | string | null>,
  tone: CellTone,
  opts?: {
    hotFrom?: number;
    hotTo?: number;
    pads?: number[];
    validFrom?: number;
    validTo?: number;
    reserve?: boolean;
    markEmpty?: boolean;
  },
): Grid {
  const cols = grid.rows[0].length;
  const next = cloneGrid(grid);
  values.forEach((value, offset) => {
    if (value == null && !opts?.reserve && !opts?.markEmpty) {
      return;
    }
    const index = start + offset;
    const row = Math.floor(index / cols);
    const col = index % cols;
    const hot = opts?.hotFrom != null && offset >= opts.hotFrom && offset < (opts.hotTo ?? values.length);
    const valid = opts?.validFrom != null && offset >= opts.validFrom && offset < (opts.validTo ?? values.length);
    let painted: Cell;
    if (opts?.pads?.includes(offset)) {
      painted = { ...padCell(hot), valid };
    } else if (opts?.reserve) {
      painted = { text: "·", tone: "c", valid: true, hot };
    } else if (opts?.markEmpty || value == null) {
      painted = { text: "·", tone: "empty", valid: true, hot };
    } else {
      painted = { ...cell(value, tone, hot), valid };
    }
    next.rows[row][col] = painted;
  });
  if (opts?.hotFrom != null) {
    next.lit = true;
  }
  return next;
}

export function reserve(grid: Grid, start: number, count: number): Grid {
  return paintLinear(grid, start, Array.from({ length: count }, () => null), "c", { reserve: true });
}

export function logicalFrom(
  rows: Array<Array<number | string>>,
  tones: CellTone | CellTone[],
  name: string,
): Grid {
  const toneAt = (row: number) => (Array.isArray(tones) ? tones[row] : tones);
  return {
    name,
    bracket: "exact",
    rows: rows.map((row, y) => row.map((value) => cell(value, toneAt(y)))),
  };
}

export function filledCount(grid: Grid): number {
  return grid.rows.flat().filter((item) => item.tone !== "empty").length;
}

export function idleRegisters(): Strip[] {
  return REG_NAMES.map((name) => strip(name, Array.from({ length: VLMAX }, emptyCell)));
}

export function fillRegs(
  fills: Array<{ index: number; values: Array<number | string>; tone: CellTone; vl: number; pads?: number[] }>,
): Strip[] {
  const regs = idleRegisters();
  fills.forEach((fill) => {
    regs[fill.index] = strip(REG_NAMES[fill.index], lanes(fill.values, fill.tone, fill.vl, fill.pads ?? []), {
      lit: true,
    });
  });
  return regs;
}
