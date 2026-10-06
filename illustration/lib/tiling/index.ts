import { addDeck } from "./add";
import { conv1dDeck } from "./conv1d";
import { matmulDeck } from "./matmul";
import { nonzeroDeck } from "./nonzero";
import { reduceDeck } from "./reduceSum";
import { softmaxDeck } from "./softmax";
import type { KernelId, LessonMode, Scene } from "./types";
import { assertTiling, type KernelDeck } from "./verify";

export const TILING_KERNELS: { id: KernelId; label: string }[] = [
  { id: "add", label: "Add" },
  { id: "reduceSum", label: "ReduceSum" },
  { id: "matmul", label: "Matmul" },
  { id: "softmax", label: "Softmax" },
  { id: "conv1d", label: "Conv 1D" },
  { id: "nonzero", label: "NonZero" },
];

export const TILING_DECKS: Record<KernelId, KernelDeck> = {
  add: addDeck,
  reduceSum: reduceDeck,
  matmul: matmulDeck,
  softmax: softmaxDeck,
  conv1d: conv1dDeck,
  nonzero: nonzeroDeck,
};

assertTiling(TILING_DECKS);

export function beatsFor(id: KernelId, mode: LessonMode): Scene[] {
  return TILING_DECKS[id][mode];
}
