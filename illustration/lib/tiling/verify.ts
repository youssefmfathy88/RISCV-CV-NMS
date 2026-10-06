import { FAST_COLS, FAST_ROWS, filledCount, MAIN_COLS, MAIN_ROWS, REG_COUNT, VCCM } from "./canvas";
import { VLMAX, type Cell, type Grid, type KernelId, type Scene } from "./types";

export type KernelDeck = { scalar: Scene[]; tiling: Scene[] };

export const ADD_A = Array.from({ length: 18 }, (_, index) => (index % 7) + 1);
export const ADD_B = Array.from({ length: 18 }, () => 1);

export const REDUCE_X = [
  [1, 2, 3, 4, 5, 6],
  [1, 1, 1, 2, 2, 2],
  [3, 3, 3, 4, 4, 4],
  [5, 6, 7, 1, 2, 3],
  [2, 2, 2, 3, 3, 3],
  [4, 4, 4, 5, 5, 5],
];

export const CONV1D_A = Array.from({ length: 18 }, (_, index) => (index % 7) + 1);
export const CONV1D_W = [1, 2, 1];

export const MATMUL_A = [
  [1, 1, 1],
  [1, 2, 1],
  [2, 1, 1],
  [1, 1, 2],
  [2, 2, 1],
  [1, 2, 2],
];
export const MATMUL_B = [
  [1, 0, 1],
  [0, 1, 0],
  [1, 0, 1],
];

export const SOFTMAX_X = [
  [1, 2, 3, 1, 2, 3],
  [1, 1, 2, 2, 3, 3],
  [1, 1, 1, 1, 1, 4],
  [1, 3, 2, 3, 2, 1],
];

export const NZ_X = [
  [0, 3, 0, 4, 0, 5],
  [1, 0, 0, 2, 0, 0],
  [0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0],
];
export const NZ_FAST = 3;

export function addVectors(left: number[], right: number[]): number[] {
  return left.map((value, index) => value + right[index]);
}

export function reduceInner(matrix: number[][]): number[] {
  return matrix.map((row) => row.reduce((sum, value) => sum + value, 0));
}

export function conv1d(input: number[], weights: number[]): number[] {
  const pad = Math.floor(weights.length / 2);
  const padded = [...Array(pad).fill(0), ...input, ...Array(pad).fill(0)];
  return input.map((_, index) =>
    weights.reduce((sum, weight, tap) => sum + weight * padded[index + tap], 0),
  );
}

export function matmul(left: number[][], right: number[][]): number[][] {
  return left.map((row) =>
    right[0].map((_, col) => row.reduce((sum, value, k) => sum + value * right[k][col], 0)),
  );
}

export function fixed2(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

export function softmaxRow(row: number[]): { max: number; exp: string[]; sum: string; out: string[] } {
  const max = Math.max(...row);
  const exp = row.map((value) => fixed2(Math.exp(value - max)));
  const sum = fixed2(exp.reduce((total, value) => total + Number(value), 0));
  const out = exp.map((value) => fixed2(Number(value) / Number(sum)));
  return { max, exp, sum, out };
}

export function nonzeroIndices(tensor: number[][]): { rows: number[]; cols: number[] } {
  const rows: number[] = [];
  const cols: number[] = [];
  tensor.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        rows.push(y);
        cols.push(x);
      }
    });
  });
  return { rows, cols };
}

function sameNumbers(got: number[], expected: number[]): boolean {
  return got.length === expected.length && got.every((value, index) => value === expected[index]);
}

function sceneById(scenes: Scene[], id: string): Scene | undefined {
  return scenes.find((scene) => scene.id === id);
}

function linearVals(grid: Grid | undefined, start: number, count: number): number[] {
  if (!grid) {
    return [];
  }
  return grid.rows
    .flat()
    .slice(start, start + count)
    .map((item) => {
      if (item.tone === "empty" || item.tone === "pad" || item.masked || item.text === "·") {
        return NaN;
      }
      return Number(item.text);
    });
}

function firstMove(scenes: Scene[]): Scene | undefined {
  return scenes.find((scene) => (scene.budget?.moved ?? 0) > 0);
}

function shapeOk(scene: Scene): boolean {
  const mainOk =
    scene.main.rows.length === MAIN_ROWS && scene.main.rows.every((row) => row.length === MAIN_COLS);
  const fastOk =
    scene.fast.rows.length === FAST_ROWS && scene.fast.rows.every((row) => row.length === FAST_COLS);
  const regOk = scene.regs.length === REG_COUNT && scene.regs.every((reg) => reg.cells.length === VLMAX);
  return mainOk && fastOk && regOk;
}

function hasPad(cells: Cell[]): boolean {
  return cells.some((item) => item.tone === "pad");
}

function push(errors: string[], ok: boolean, message: string) {
  if (!ok) {
    errors.push(message);
  }
}

export function tilingErrors(decks: Record<KernelId, KernelDeck>): string[] {
  const errors: string[] = [];
  const addC = addVectors(ADD_A, ADD_B);
  const reduceSums = reduceInner(REDUCE_X);
  const conv1 = conv1d(CONV1D_A, CONV1D_W);
  const product = matmul(MATMUL_A, MATMUL_B);
  const soft = SOFTMAX_X.map(softmaxRow);
  const nz = nonzeroIndices(NZ_X);
  const nzLinear = nz.rows.map((row, index) => row * 6 + nz.cols[index]);

  push(errors, sameNumbers(addC.slice(0, 6), [2, 3, 4, 5, 6, 7]), "add math");
  push(errors, sameNumbers(reduceSums, [21, 9, 21, 24, 15, 27]), "reduceSum math");
  push(errors, sameNumbers(conv1.slice(0, 3), [4, 8, 12]), "conv1d head");
  push(errors, sameNumbers(conv1.slice(15), [8, 12, 11]), "conv1d tail");
  push(errors, sameNumbers(product[0], [2, 1, 2]) && sameNumbers(product[4], [3, 2, 3]), "matmul math");
  push(
    errors,
    soft[0].max === 3 && soft[0].sum === "3.02" && soft[0].out.join() === "0.05,0.12,0.33,0.05,0.12,0.33",
    "softmax math",
  );
  push(errors, sameNumbers(nz.rows, [0, 0, 0, 1, 1]) && sameNumbers(nz.cols, [1, 3, 5, 0, 3]), "nonzero math");

  (Object.keys(decks) as KernelId[]).forEach((id) => {
    const deck = decks[id];
    (["scalar", "tiling"] as const).forEach((mode) => {
      const scenes = deck[mode];
      if (scenes.length === 0) {
        return;
      }
      push(errors, scenes.length > 1, `${id} ${mode} has beats`);
      scenes.forEach((scene) => {
        push(errors, shapeOk(scene), `${scene.id} frame shape`);
        push(errors, scene.title.split(" ").length <= 4, `${scene.id} title is short`);
        if (mode === "tiling") {
          push(errors, !hasPad(scene.main.rows.flat()), `${scene.id} pad leaked into main`);
        }
      });
      deck.tiling.forEach((scene) => {
        const budget = scene.budget;
        push(errors, budget != null && scene.logical != null, `${scene.id} has a budget and a logical tensor`);
        if (!budget) {
          return;
        }
        push(errors, budget.input + budget.output + budget.pad <= VCCM, `${scene.id} fits in VCCM`);
        push(errors, budget.used <= VCCM && budget.used === filledCount(scene.fast), `${scene.id} fast occupancy`);
      });
    });
    const tiling = deck.tiling;
    push(errors, tiling[0]?.hop === "dram", `${id} opens on allocation`);
    push(errors, tiling[tiling.length - 1]?.hop === "writeback", `${id} ends on write-back`);
  });

  const expectMove = (scenes: Scene[], moved: number, used: number, label: string) => {
    const scene = firstMove(scenes);
    push(errors, scene?.budget?.moved === moved && scene.budget.used === used, `${label} first trip moved ${scene?.budget?.moved} used ${scene?.budget?.used}`);
  };
  expectMove(decks.add.tiling, 24, 36, "add");
  expectMove(decks.reduceSum.tiling, 30, 35, "reduce");
  expectMove(decks.conv1d.tiling, 18, 35, "conv1d");
  expectMove(decks.matmul.tiling, 21, 33, "matmul");
  expectMove(decks.softmax.tiling, 18, 36, "softmax");
  expectMove(decks.nonzero.tiling, 24, 27, "nonzero");

  const addDone = sceneById(decks.add.tiling, "add-write2");
  const addRest = sceneById(decks.add.tiling, "add-move2");
  push(errors, sameNumbers(linearVals(addDone?.main, 36, 18), addC), "add drawn C");
  push(errors, addRest?.budget?.remainder === true && addRest.budget.used === 18, "add remainder");

  const reduceMove = sceneById(decks.reduceSum.tiling, "reduce-move");
  const reduceRest = sceneById(decks.reduceSum.tiling, "reduce-move2");
  const reduceDone = sceneById(decks.reduceSum.tiling, "reduce-write2");
  push(errors, sameNumbers(linearVals(reduceMove?.fast, 0, 30), REDUCE_X.slice(0, 5).flat()), "reduce first trip is five rows");
  push(errors, reduceRest?.budget?.remainder === true && reduceRest.budget.used === 7, "reduce remainder");
  push(errors, sameNumbers(linearVals(reduceDone?.main, 36, 6), reduceSums), "reduce drawn sums");

  const inject = sceneById(decks.conv1d.tiling, "conv1d-inject");
  const convTail = sceneById(decks.conv1d.tiling, "conv1d-alu2");
  const convDone = sceneById(decks.conv1d.tiling, "conv1d-write2");
  const convRest = sceneById(decks.conv1d.tiling, "conv1d-move2");
  push(errors, inject?.fast.rows[0]?.[0]?.tone === "pad" && inject.budget?.used === 36, "conv1d injects the left zero");
  push(errors, sceneById(decks.conv1d.tiling, "conv1d-alu")?.alu?.map((lane) => lane.result).join() === conv1.slice(0, 3).join(), "conv1d first strip");
  push(errors, convTail?.alu?.length === 1 && convTail.alu[0]?.result === String(conv1[17]), "conv1d last output");
  push(errors, convRest?.budget?.remainder === true && convRest.budget.moved === 2 && convRest.budget.used === 3, "conv1d reloads two taps");
  push(errors, sameNumbers(linearVals(convDone?.main, 18, 18), conv1), "conv1d drawn C");

  const matmulAlu = sceneById(decks.matmul.tiling, "matmul-alu");
  const matmulRest = sceneById(decks.matmul.tiling, "matmul-move2");
  const matmulDone = sceneById(decks.matmul.tiling, "matmul-write2");
  push(errors, matmulAlu?.alu?.map((lane) => lane.result).join() === "2,1,2", "matmul first vector row");
  push(errors, matmulAlu?.product?.[2]?.rows[0]?.map((item) => item.text).join() === "2,1,2", "matmul logical C row");
  push(errors, matmulAlu?.product?.length === 3, "matmul logical is A times B");
  push(errors, decks.matmul.scalar.length === 0, "matmul has no scalar");
  push(errors, matmulRest?.budget?.remainder === true && sameNumbers(linearVals(matmulRest?.fast, 0, 9), MATMUL_B.flat()), "matmul reloads B");
  push(errors, sameNumbers(linearVals(matmulDone?.main, 27, 18), product.flat()), "matmul drawn C");

  const softDiv = sceneById(decks.softmax.tiling, "softmax-div");
  const softRest = sceneById(decks.softmax.tiling, "softmax-move2");
  const softDone = sceneById(decks.softmax.tiling, "softmax-write2");
  push(errors, softDiv?.formula.includes("exp") === true && softDiv.alu?.map((lane) => lane.result).join() === "0.05,0.12,0.33", "softmax vector equation");
  push(
    errors,
    decks.softmax.scalar.length === 0 &&
      decks.softmax.tiling.every((scene) => scene.equation?.join(" | ") === "m = max(x) | e[i] = exp(x[i] − m) | y[i] = e[i] / sum(e)"),
    "softmax equation on the tiling slides",
  );
  push(errors, softRest?.budget?.remainder === true && softRest.budget.used === 12, "softmax remainder");
  push(
    errors,
    sameNumbers(linearVals(softDone?.main, 24, 24), soft.flatMap((row) => row.out).map(Number)),
    "softmax drawn Y",
  );

  const nzFlush = sceneById(decks.nonzero.tiling, "nz-flush");
  const nzTail = sceneById(decks.nonzero.tiling, "nz-tail");
  push(errors, nzFlush?.hop === "writeback" && nzFlush.mark === "flush", "nonzero flushes early");
  push(errors, sameNumbers(linearVals(nzFlush?.main, 24, 3), nzLinear.slice(0, 3)), "nonzero indices after flush");
  push(errors, sameNumbers(linearVals(nzTail?.main, 24, 5), nzLinear), "nonzero drawn indices");
  push(errors, decks.nonzero.tiling.filter((scene) => scene.hop === "writeback").length === 2, "nonzero writes main memory twice");

  const scalarPad1 = sceneById(decks.conv1d.scalar, "conv1d-pad");
  const scalarCells1 = scalarPad1?.main.rows.flat() ?? [];
  push(errors, scalarCells1[0]?.tone === "pad" && scalarCells1[19]?.tone === "pad", "conv1d scalar pads both edges");
  return errors;
}

export function assertTiling(decks: Record<KernelId, KernelDeck>): void {
  const errors = tilingErrors(decks);
  if (errors.length > 0) {
    throw new Error(`Tiling deck mismatch:\n${errors.join("\n")}`);
  }
}
