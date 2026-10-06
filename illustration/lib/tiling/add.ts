import { emptyFast, emptyMain, fillRegs, idleRegisters, logicalFrom, paintLinear, reserve } from "./canvas";
import type { Budget, Grid, Scene } from "./types";
import { ADD_A, ADD_B, addVectors } from "./verify";

const C = addVectors(ADD_A, ADD_B);
const TRIP = 12;
const TAIL = 6;

const logical = logicalFrom(
  [
    ADD_A.slice(0, 6),
    ADD_A.slice(6, 12),
    ADD_A.slice(12, 18),
    ADD_B.slice(0, 6),
    ADD_B.slice(6, 12),
    ADD_B.slice(12, 18),
  ],
  ["a", "a", "a", "b", "b", "b"],
  "A[18] B[18]",
);

function budget(moved: number, count: number, cFilled: number, remainder = false): Budget {
  const used = moved === 0 ? 0 : count * 2 + count;
  return {
    input: count * 2,
    output: count,
    pad: 0,
    moved,
    used: cFilled < 0 ? 0 : used,
    remainder,
  };
}

function mainOf(cFilled: number, hotStart = -1, hotCount = 0): Grid {
  let main = paintLinear(emptyMain(), 0, ADD_A, "a", hotStart >= 0 && hotStart < 18 ? { hotFrom: hotStart, hotTo: hotStart + hotCount } : undefined);
  main = paintLinear(main, 18, ADD_B, "b", hotStart >= 18 && hotStart < 36 ? { hotFrom: hotStart - 18, hotTo: hotStart - 18 + hotCount } : undefined);
  if (cFilled > 0) {
    main = paintLinear(main, 36, C.slice(0, cFilled), "c", {
      validFrom: 0,
      validTo: cFilled,
      ...(hotStart >= 36 ? { hotFrom: hotStart - 36, hotTo: hotStart - 36 + hotCount } : {}),
    });
  }
  return main;
}

function fastOf(offset: number, count: number, cFilled: number): Grid {
  let fast = paintLinear(emptyFast(), 0, ADD_A.slice(offset, offset + count), "a", { hotFrom: 0, hotTo: count });
  fast = paintLinear(fast, count, ADD_B.slice(offset, offset + count), "b", { hotFrom: 0, hotTo: count });
  if (cFilled > 0) {
    fast = paintLinear(fast, count * 2, C.slice(offset, offset + cFilled), "c", { hotFrom: 0, hotTo: Math.min(3, cFilled) });
    if (cFilled < count) {
      fast = reserve(fast, count * 2 + cFilled, count - cFilled);
    }
  } else {
    fast = reserve(fast, count * 2, count);
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
    formula: "C[i] = A[i] + B[i]",
    op: "vadd.vv",
    constraint: "3 live buffers",
    logical,
    budget: budget(0, TRIP, -1),
    main,
    fast: emptyFast(),
    regs: idleRegisters(),
    alu: null,
    avl: 18,
    vl: 0,
    ...extra,
  };
}

function lanes(offset: number) {
  const a = ADD_A.slice(offset, offset + 3);
  const b = ADD_B.slice(offset, offset + 3);
  return a.map((left, index) => ({
    label: `lane ${index}`,
    expr: `${left} + ${b[index]}`,
    result: String(left + b[index]),
  }));
}

const scalar: Scene[] = [
  beat("add-goal", "Add two vectors", "C[i] = A[i] + B[i]", "dram", mainOf(0), {
    logical: undefined,
    budget: undefined,
  }),
  ...[0, 1, 2].map((index) =>
    beat(`add-s${index}`, `Write C ${index}`, `C[${index}] = ${ADD_A[index]} + ${ADD_B[index]} = ${C[index]}`, "alu", mainOf(index + 1, 36 + index, 1), {
      logical: undefined,
      budget: undefined,
      alu: [{ label: `C ${index}`, expr: `${ADD_A[index]} + ${ADD_B[index]}`, result: String(C[index]) }],
    }),
  ),
  beat("add-s-rest", "Fill the rest", "C[3..17] = A[3..17] + B[3..17]", "alu", mainOf(18), {
    logical: undefined,
    budget: undefined,
  }),
];

export const addDeck = {
  scalar,
  tiling: [
    beat("add-shape", "Two input vectors", "A[18]  B[18]  C[18]", "dram", mainOf(0)),
    beat("add-budget", "Trip length 12", "3T ≤ 36 → T = 12", "dram", mainOf(0), {
      budget: budget(0, TRIP, -1),
    }),
    beat("add-move", "Move twelve", "moved 24  used 36/36", "vm", mainOf(0, 0, TRIP), {
      budget: budget(TRIP * 2, TRIP, 0),
      fast: fastOf(0, TRIP, 0),
    }),
    beat("add-load", "Load first strip", "VL=3  A[0..2]  B[0..2]", "reg", mainOf(0), {
      budget: budget(TRIP * 2, TRIP, 0),
      fast: fastOf(0, TRIP, 0),
      regs: fillRegs([
        { index: 0, values: ADD_A.slice(0, 3), tone: "a", vl: 3 },
        { index: 1, values: ADD_B.slice(0, 3), tone: "b", vl: 3 },
      ]),
      avl: TRIP,
      vl: 3,
    }),
    beat("add-alu", "Add first strip", `C[0..2] = [${C.slice(0, 3).join(", ")}]`, "alu", mainOf(0), {
      budget: budget(TRIP * 2, TRIP, 0),
      fast: fastOf(0, TRIP, 0),
      regs: fillRegs([
        { index: 0, values: ADD_A.slice(0, 3), tone: "a", vl: 3 },
        { index: 1, values: ADD_B.slice(0, 3), tone: "b", vl: 3 },
        { index: 2, values: C.slice(0, 3), tone: "c", vl: 3 },
      ]),
      alu: lanes(0),
      avl: TRIP,
      vl: 3,
    }),
    beat("add-store", "Store the strip", "fast C[0..2]", "vm", mainOf(0), {
      budget: budget(TRIP * 2, TRIP, 0),
      fast: fastOf(0, TRIP, 3),
      vl: 3,
    }),
    beat("add-write", "Write trip one", "C[0..11] = A[0..11] + B[0..11]", "writeback", mainOf(TRIP, 36, TRIP), {
      budget: budget(TRIP * 2, TRIP, 0),
      fast: fastOf(0, TRIP, TRIP),
    }),
    beat("add-move2", "Move the remainder", "moved 12  used 18/36", "vm", mainOf(TRIP, 12, TAIL), {
      budget: budget(TAIL * 2, TAIL, 0, true),
      fast: fastOf(TRIP, TAIL, 0),
    }),
    beat("add-load2", "Load the tail", "VL=3  A[12..14]  B[12..14]", "reg", mainOf(TRIP), {
      budget: budget(TAIL * 2, TAIL, 0, true),
      fast: fastOf(TRIP, TAIL, 0),
      regs: fillRegs([
        { index: 0, values: ADD_A.slice(TRIP, TRIP + 3), tone: "a", vl: 3 },
        { index: 1, values: ADD_B.slice(TRIP, TRIP + 3), tone: "b", vl: 3 },
      ]),
      avl: TAIL,
      vl: 3,
    }),
    beat("add-alu2", "Add the tail", `C[12..14] = [${C.slice(TRIP, TRIP + 3).join(", ")}]`, "alu", mainOf(TRIP), {
      budget: budget(TAIL * 2, TAIL, 0, true),
      fast: fastOf(TRIP, TAIL, 0),
      regs: fillRegs([
        { index: 0, values: ADD_A.slice(TRIP, TRIP + 3), tone: "a", vl: 3 },
        { index: 1, values: ADD_B.slice(TRIP, TRIP + 3), tone: "b", vl: 3 },
        { index: 2, values: C.slice(TRIP, TRIP + 3), tone: "c", vl: 3 },
      ]),
      alu: lanes(TRIP),
      avl: TAIL,
      vl: 3,
    }),
    beat("add-write2", "Write remainder", "C[12..17] = A[12..17] + B[12..17]", "writeback", mainOf(18, 36 + TRIP, TAIL), {
      budget: budget(TAIL * 2, TAIL, 0, true),
      fast: fastOf(TRIP, TAIL, TAIL),
    }),
  ],
};
