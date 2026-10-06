export const VLMAX = 3;

export type LessonMode = "scalar" | "tiling";

export type KernelId =
  | "add"
  | "reduceSum"
  | "conv1d"
  | "matmul"
  | "softmax"
  | "nonzero";

export type Hop = "dram" | "vm" | "reg" | "alu" | "writeback";

export type CellTone = "a" | "b" | "c" | "pad" | "drop";

export type Cell = {
  text: string;
  tone: CellTone | "empty";
  hot?: boolean;
  masked?: boolean;
  valid?: boolean;
};

export type Bracket = "exact" | "max";

export type Strip = {
  name: string;
  cells: Cell[];
  group?: number;
  lit?: boolean;
  full?: boolean;
  bracket?: Bracket;
  /** Leading cells covered by the valid mark when bracket is "max". */
  valid?: number;
};

export type Grid = {
  name: string;
  rows: Cell[][];
  lit?: boolean;
  bracket?: Bracket;
};

export type AluLane = {
  label: string;
  expr: string;
  result: string | null;
  masked?: boolean;
};

export type BoxChip = {
  index: number;
  score: string;
  state: "idle" | "keep" | "drop" | "hot";
  cluster: number;
};

/** Resident counts for one VCCM trip. `used` is input + output + pad actually drawn. */
export type Budget = {
  input: number;
  output: number;
  pad: number;
  moved: number;
  used: number;
  remainder?: boolean;
};

export type Scene = {
  id: string;
  title: string;
  changed: string;
  hop: Hop;
  formula: string;
  /** Lines kept on the tiling slide, for an equation the class tiles directly. */
  equation?: string[];
  op: string;
  avl: number;
  vl: number;
  constraint: string;
  /** Programmer-facing tensor. Tiling only; shape follows the kernel. */
  logical?: Grid;
  /** Matmul logical picture: A, B, then C. */
  product?: Grid[];
  budget?: Budget;
  main: Grid;
  fast: Grid;
  regs: Strip[];
  weights?: number[][];
  alu: AluLane[] | null;
  boxes?: BoxChip[];
  acc?: { name: string; text: string; hot?: boolean } | null;
  mark?: "inject" | "flush";
  full?: boolean;
};

export function emptyCell(): Cell {
  return { text: "·", tone: "empty" };
}

export function maskedCell(): Cell {
  return { text: "—", tone: "empty", masked: true };
}

export function padCell(hot = false): Cell {
  return { text: "0", tone: "pad", hot };
}

export function cell(value: number | string, tone: CellTone, hot = false): Cell {
  return { text: String(value), tone, hot };
}

export function blanks(count: number): Cell[] {
  return Array.from({ length: count }, emptyCell);
}

export function strip(
  name: string,
  cells: Cell[],
  extra?: Partial<Omit<Strip, "name" | "cells">>,
): Strip {
  return { name, cells, ...extra };
}

export function values(
  nums: Array<number | null>,
  tone: CellTone,
  hotStart = -1,
  hotEnd = -1,
): Cell[] {
  return nums.map((value, index) => {
    if (value == null) {
      return emptyCell();
    }
    return cell(value, tone, index >= hotStart && index < hotEnd);
  });
}

export function lanes(
  nums: Array<number | string>,
  tone: CellTone,
  vl: number,
  padIndexes: number[] = [],
): Cell[] {
  const out: Cell[] = [];
  for (let i = 0; i < VLMAX; i += 1) {
    if (i >= vl) {
      out.push(maskedCell());
      continue;
    }
    const pad = padIndexes.includes(i);
    out.push({
      text: String(nums[i]),
      tone: pad ? "pad" : tone,
      hot: true,
    });
  }
  return out;
}

export function idleRegs(names: string[]): Strip[] {
  return names.map((name) => strip(name, blanks(VLMAX)));
}
