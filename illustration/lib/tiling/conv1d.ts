import { emptyFast, emptyMain, fillRegs, idleRegisters, logicalFrom, paintLinear, reserve } from "./canvas";
import type { Budget, Grid, Scene } from "./types";
import { CONV1D_A, CONV1D_W, conv1d } from "./verify";

const C = conv1d(CONV1D_A, CONV1D_W);
const W = CONV1D_W;
const PADDED = [0, ...CONV1D_A, 0];

const logical = logicalFrom(
  [CONV1D_A.slice(0, 6), CONV1D_A.slice(6, 12), CONV1D_A.slice(12, 18)],
  "a",
  "A[18]",
);

function budget(input: number, output: number, pad: number, moved: number, remainder = false): Budget {
  return {
    input,
    output,
    pad,
    moved,
    used: moved === 0 ? 0 : input + output + pad,
    remainder,
  };
}

function mainOf(cFilled: number, hotStart = -1, hotCount = 0): Grid {
  let main = paintLinear(emptyMain(), 0, CONV1D_A, "a", hotStart >= 0 && hotStart < 18 ? { hotFrom: hotStart, hotTo: hotStart + hotCount } : undefined);
  if (cFilled > 0) {
    main = paintLinear(main, 18, C.slice(0, cFilled), "c", {
      validFrom: 0,
      validTo: cFilled,
      ...(hotStart >= 18 ? { hotFrom: hotStart - 18, hotTo: hotStart - 18 + hotCount } : {}),
    });
  }
  return main;
}

function fastTrip(injected: boolean, cFilled: number): Grid {
  let fast = paintLinear(emptyFast(), 1, CONV1D_A, "a");
  if (injected) {
    fast = paintLinear(fast, 0, [0], "a", { pads: [0], hotFrom: 0, hotTo: 1 });
  }
  if (cFilled > 0) {
    fast = paintLinear(fast, 19, C.slice(0, cFilled), "c");
    if (cFilled < 17) {
      fast = reserve(fast, 19 + cFilled, 17 - cFilled);
    }
  } else {
    fast = reserve(fast, 19, 17);
  }
  return fast;
}

function fastTail(injected: boolean, written: boolean): Grid {
  let fast = paintLinear(emptyFast(), 0, CONV1D_A.slice(16, 18), "a", { hotFrom: 0, hotTo: 2 });
  if (injected) {
    fast = paintLinear(fast, 2, [0], "a", { pads: [0], hotFrom: 0, hotTo: 1 });
  }
  if (written) {
    fast = paintLinear(fast, 3, [C[17]], "c");
  } else {
    fast = reserve(fast, 3, 1);
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
    formula: "C[i] = W · window",
    op: "K = 3",
    constraint: "pad not in DRAM",
    weights: [W],
    logical,
    budget: budget(18, 17, 1, 0),
    main,
    fast: emptyFast(),
    regs: idleRegisters(),
    alu: null,
    avl: 17,
    vl: 0,
    ...extra,
  };
}

function scalarMain(cFilled: number, hotIndex = -1): Grid {
  let main = paintLinear(emptyMain(), 0, [0], "a", { pads: [0] });
  main = paintLinear(main, 1, CONV1D_A, "a");
  main = paintLinear(main, 19, [0], "a", { pads: [0] });
  if (cFilled > 0) {
    main = paintLinear(main, 20, C.slice(0, cFilled), "c", { validFrom: 0, validTo: cFilled });
  }
  if (hotIndex >= 0) {
    for (let tap = 0; tap < 3; tap += 1) {
      const at = hotIndex + tap;
      const edge = at === 0 || at === 19;
      main = paintLinear(main, at, [edge ? 0 : CONV1D_A[at - 1]], "a", {
        pads: edge ? [0] : [],
        hotFrom: 0,
        hotTo: 1,
      });
    }
  }
  return main;
}

function windowAt(at: number) {
  const taps = [PADDED[at], PADDED[at + 1], PADDED[at + 2]];
  return {
    label: `C ${at}`,
    expr: `${taps[0]}·${W[0]} + ${taps[1]}·${W[1]} + ${taps[2]}·${W[2]}`,
    result: String(C[at]),
  };
}

function windows(start: number) {
  return [0, 1, 2].map((lane) => windowAt(start + lane));
}

const scalar: Scene[] = [
  beat("conv1d-goal", "Weight each window", "K = 3  W = [1, 2, 1]", "dram", mainOf(0), {
    logical: undefined,
    budget: undefined,
    constraint: "K = 3",
  }),
  beat("conv1d-pad", "Pad both edges", "padded = [0] + A + [0]", "dram", scalarMain(0), {
    logical: undefined,
    budget: undefined,
    constraint: "pad 1 each edge",
  }),
  ...[0, 1, 2].map((index) =>
    beat(`conv1d-s${index}`, `Write C ${index}`, `C[${index}] = ${windows(0)[index].expr}`, "alu", scalarMain(index + 1, index), {
      logical: undefined,
      budget: undefined,
      constraint: "pad 1 each edge",
      alu: [windows(0)[index]],
    }),
  ),
  beat("conv1d-s-rest", "Fill the rest", "C[3..17] from the same padded line", "alu", scalarMain(18), {
    logical: undefined,
    budget: undefined,
    constraint: "pad 1 each edge",
  }),
];

export const conv1dDeck = {
  scalar,
  tiling: [
    beat("conv1d-shape", "Image length 18", "A[18]  C[18]", "dram", mainOf(0)),
    beat("conv1d-budget", "Seventeen outputs fit", "18 + 17 + 1 = 36", "dram", mainOf(0)),
    beat("conv1d-move", "Move all A", "moved 18  left zero still out", "vm", mainOf(0, 0, 18), {
      budget: budget(18, 17, 0, 18),
      fast: fastTrip(false, 0),
    }),
    beat("conv1d-inject", "Inject left zero", "fast[0] = 0  not from DRAM", "vm", mainOf(0), {
      budget: budget(18, 17, 1, 18),
      fast: fastTrip(true, 0),
      mark: "inject",
    }),
    beat("conv1d-load", "Load three windows", "VL=3  pixels stay for K=3", "reg", mainOf(0), {
      budget: budget(18, 17, 1, 18),
      fast: fastTrip(true, 0),
      regs: fillRegs([
        { index: 0, values: PADDED.slice(0, 3), tone: "a", vl: 3, pads: [0] },
        { index: 1, values: PADDED.slice(1, 4), tone: "a", vl: 3 },
        { index: 2, values: PADDED.slice(2, 5), tone: "a", vl: 3 },
      ]),
      vl: 3,
    }),
    beat("conv1d-alu", "Weight three windows", `C[0..2] = [${C.slice(0, 3).join(", ")}]`, "alu", mainOf(0), {
      budget: budget(18, 17, 1, 18),
      fast: fastTrip(true, 0),
      regs: fillRegs([{ index: 3, values: C.slice(0, 3), tone: "c", vl: 3 }]),
      alu: windows(0),
      vl: 3,
    }),
    beat("conv1d-write", "Write seventeen", "C[0..16] from the resident tile", "writeback", mainOf(17, 18, 17), {
      budget: budget(18, 17, 1, 18),
      fast: fastTrip(true, 17),
    }),
    beat("conv1d-move2", "Reload two taps", "moved 2  A[16] and A[17]", "vm", mainOf(17, 16, 2), {
      budget: budget(2, 1, 0, 2, true),
      fast: fastTail(false, false),
      avl: 1,
    }),
    beat("conv1d-inject2", "Inject right zero", "the last window hangs off", "vm", mainOf(17), {
      budget: budget(2, 1, 1, 2, true),
      fast: fastTail(true, false),
      mark: "inject",
      avl: 1,
    }),
    beat("conv1d-alu2", "Weight last output", `C[17] = ${windowAt(17).expr}`, "alu", mainOf(17), {
      budget: budget(2, 1, 1, 2, true),
      fast: fastTail(true, false),
      alu: [windowAt(17)],
      avl: 1,
      vl: 1,
    }),
    beat("conv1d-write2", "Write last output", `C[17] = ${C[17]}`, "writeback", mainOf(18, 18 + 17, 1), {
      budget: budget(2, 1, 1, 2, true),
      fast: fastTail(true, true),
      avl: 1,
    }),
  ],
};
