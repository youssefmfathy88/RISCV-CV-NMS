"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Cpu, Database, MemoryStick, Sigma } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import styles from "./TilingDeck.module.css";

const VLMAX = 4;

const ADD_A = [1, 2, 3, 4, 5, 6, 7, 8];
const ADD_B = [10, 20, 30, 40, 50, 60, 70, 80];
const ADD_C = ADD_A.map((value, i) => value + ADD_B[i]);

const CONV_A = [1, 2, 3, 4, 5, 6, 7, 8];
const CONV_C = [6, 9, 12, 15, 18, 21];
const CONV_N = CONV_A.length;

type KernelId = "add" | "convolution";
type Hop = "dram" | "vm" | "reg" | "alu" | "writeback";
type VecId = "A" | "B" | "C";
type Slots = Array<number | null>;

type Hot = { vec: VecId; start: number; len: number };

type AluLane = {
  parts: number[];
  result: number | null;
  masked?: boolean;
};

type Scene = {
  caption: string;
  changed: string;
  hop: Hop;
  formula: string;
  op: string;
  avl: number;
  vl: number;
  dramA: Slots;
  dramB: Slots | null;
  dramC: Slots;
  vmA: Slots;
  vmB: Slots | null;
  vmC: Slots;
  regs: { name: string; values: Slots }[];
  alu: AluLane[] | null;
  hotDram: Hot | null;
  hotVm: Hot | null;
  hotRegs: string[];
  halo: number[] | null;
};

const HOPS: { id: Hop; label: string }[] = [
  { id: "dram", label: "Main Memory" },
  { id: "vm", label: "Fast Memory" },
  { id: "reg", label: "Vector Registers" },
  { id: "alu", label: "ALU" },
  { id: "writeback", label: "Back to Memory" },
];

const KERNEL_TABS: { id: KernelId; label: string; formula: string }[] = [
  { id: "add", label: "Add", formula: "C[i] = A[i] + B[i]" },
  {
    id: "convolution",
    label: "Convolution",
    formula: "C[i] = A[i−1] + A[i] + A[i+1]",
  },
];

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function empty(n: number): Slots {
  return Array.from({ length: n }, () => null);
}

function lanes(values: number[], offset = 0): Slots {
  const out: Slots = empty(VLMAX);
  for (let i = 0; i < VLMAX; i += 1) {
    const value = values[offset + i];
    out[i] = value === undefined ? null : value;
  }
  return out;
}

function fillRange(source: number[], until: number): Slots {
  return source.map((value, i) => (i < until ? value : null));
}

function addScene(beat: number): Scene {
  const n = ADD_A.length;
  const none = empty(n);
  const blankLanes = empty(VLMAX);
  const strip = beat >= 7 && beat <= 10 ? 1 : beat >= 3 && beat <= 6 ? 0 : -1;

  const vmA = beat >= 1 ? ADD_A : none;
  const vmB = beat >= 2 ? ADD_B : none;
  const vmC =
    beat >= 10 ? ADD_C : beat >= 6 ? fillRange(ADD_C, 4) : none;
  const dramC = beat >= 11 ? ADD_C : none;

  let vA = blankLanes;
  let vB = blankLanes;
  let vC = blankLanes;
  if (beat === 3) vA = lanes(ADD_A, 0);
  if (beat === 4 || beat === 5 || beat === 6) {
    vA = lanes(ADD_A, 0);
    vB = lanes(ADD_B, 0);
  }
  if (beat === 5 || beat === 6) vC = lanes(ADD_C, 0);
  if (beat === 7) vA = lanes(ADD_A, 4);
  if (beat === 8 || beat === 9 || beat === 10 || beat === 11) {
    vA = lanes(ADD_A, 4);
    vB = lanes(ADD_B, 4);
  }
  if (beat >= 9) vC = lanes(ADD_C, 4);

  const alu: AluLane[] | null =
    beat === 5 || beat === 6
      ? ADD_A.slice(0, 4).map((left, i) => ({
          parts: [left, ADD_B[i]],
          result: beat >= 5 ? ADD_C[i] : null,
        }))
      : beat >= 9
        ? ADD_A.slice(4, 8).map((left, i) => ({
            parts: [left, ADD_B[4 + i]],
            result: beat >= 9 ? ADD_C[4 + i] : null,
          }))
        : beat === 4
          ? ADD_A.slice(0, 4).map((left, i) => ({
              parts: [left, ADD_B[i]],
              result: null,
            }))
          : beat === 8
            ? ADD_A.slice(4, 8).map((left, i) => ({
                parts: [left, ADD_B[4 + i]],
                result: null,
              }))
            : null;

  const copy = ADD_BEATS[beat] ?? ADD_BEATS[0];
  return {
    ...copy,
    formula: "C[i] = A[i] + B[i]",
    op: "vadd.vv",
    dramA: ADD_A,
    dramB: ADD_B,
    dramC,
    vmA,
    vmB,
    vmC,
    regs: [
      { name: "vA", values: vA },
      { name: "vB", values: vB },
      { name: "vC", values: vC },
    ],
    alu,
    hotDram:
      beat === 1
        ? { vec: "A", start: 0, len: n }
        : beat === 2
          ? { vec: "B", start: 0, len: n }
          : beat === 3
            ? { vec: "A", start: 0, len: 4 }
            : beat === 4
              ? { vec: "B", start: 0, len: 4 }
              : beat === 7
                ? { vec: "A", start: 4, len: 4 }
                : beat === 8
                  ? { vec: "B", start: 4, len: 4 }
                  : beat === 11
                    ? { vec: "C", start: 0, len: n }
                    : null,
    hotVm:
      beat === 1
        ? { vec: "A", start: 0, len: n }
        : beat === 2
          ? { vec: "B", start: 0, len: n }
          : beat === 3
            ? { vec: "A", start: 0, len: 4 }
            : beat === 4
              ? { vec: "B", start: 0, len: 4 }
              : beat === 6
                ? { vec: "C", start: 0, len: 4 }
                : beat === 7
                  ? { vec: "A", start: 4, len: 4 }
                  : beat === 8
                    ? { vec: "B", start: 4, len: 4 }
                    : beat === 10
                      ? { vec: "C", start: 4, len: 4 }
                      : null,
    hotRegs:
      beat === 3
        ? ["vA"]
        : beat === 4
          ? ["vB"]
          : beat === 5 || beat === 9
            ? ["vC"]
            : beat === 7
              ? ["vA"]
              : beat === 8
                ? ["vB"]
                : [],
    halo: null,
    vl: strip >= 0 || beat === 11 ? 4 : 0,
    avl: beat >= 11 ? 0 : beat >= 7 ? 4 : 8,
  };
}

const ADD_BEATS: Pick<Scene, "caption" | "changed" | "hop">[] = [
  {
    hop: "dram",
    caption:
      "A and B live in slow DRAM. We will compute C[i] = A[i] + B[i] with VLMAX = 4.",
    changed: "—",
  },
  {
    hop: "vm",
    caption:
      "Memory tiling: copy the whole A tile from DRAM into fast Vector Memory.",
    changed: "VM.A[0..7] = DRAM.A[0..7]",
  },
  {
    hop: "vm",
    caption: "Copy B the same way. Both tiles now sit in fast memory, ready for the ALU.",
    changed: "VM.B[0..7] = DRAM.B[0..7]",
  },
  {
    hop: "reg",
    caption:
      "Register tiling: vsetvli(AVL=8) grants VL=4. Load the first strip of A into vA.",
    changed: "vA = VM.A[0..3]   VL=4  AVL=8",
  },
  {
    hop: "reg",
    caption: "Load the matching strip of B. Each lane now holds a pair (A[i], B[i]).",
    changed: "vB = VM.B[0..3]",
  },
  {
    hop: "alu",
    caption: "ALU runs vadd.vv — four additions in one instruction.",
    changed: "vC = vA + vB = [11, 22, 33, 44]",
  },
  {
    hop: "vm",
    caption: "Store the first C strip from the registers back into Vector Memory.",
    changed: "VM.C[0..3] = vC",
  },
  {
    hop: "reg",
    caption: "AVL shrinks by VL: 8 − 4 = 4. Load A[4..7] for the second strip.",
    changed: "vA = VM.A[4..7]   VL=4  AVL=4",
  },
  {
    hop: "reg",
    caption: "Load B[4..7] into vB.",
    changed: "vB = VM.B[4..7]",
  },
  {
    hop: "alu",
    caption: "ALU adds the second strip in parallel. No scalar leftover loop.",
    changed: "vC = vA + vB = [55, 66, 77, 88]",
  },
  {
    hop: "vm",
    caption: "Second strip lands in Vector Memory. The whole C tile is ready.",
    changed: "VM.C[4..7] = vC",
  },
  {
    hop: "writeback",
    caption: "Write the C tile from Vector Memory back to DRAM. The add is done.",
    changed: "DRAM.C[0..7] = VM.C[0..7]",
  },
];

function convCSlots(until: number): Slots {
  const out = empty(CONV_N);
  for (let i = 0; i < CONV_C.length; i += 1) {
    const slot = i + 1;
    if (i < until) out[slot] = CONV_C[i];
  }
  return out;
}

function addSceneConv(beat: number): Scene {
  const none = empty(CONV_N);
  const blankLanes = empty(VLMAX);
  const vmA = beat >= 2 ? CONV_A : none;
  const vmC = beat >= 8 ? convCSlots(6) : beat >= 5 ? convCSlots(4) : none;
  const dramC = beat >= 9 ? convCSlots(6) : none;

  let vL = blankLanes;
  let vMid = blankLanes;
  let vR = blankLanes;
  let vOut = blankLanes;

  if (beat === 3 || beat === 4 || beat === 5) {
    vL = lanes(CONV_A, 0);
    vMid = lanes(CONV_A, 1);
    vR = lanes(CONV_A, 2);
  }
  if (beat === 4 || beat === 5) vOut = lanes(CONV_C, 0);
  if (beat >= 6 && beat <= 9) {
    vL = [CONV_A[4], CONV_A[5], null, null];
    vMid = [CONV_A[5], CONV_A[6], null, null];
    vR = [CONV_A[6], CONV_A[7], null, null];
  }
  if (beat >= 7) vOut = [CONV_C[4], CONV_C[5], null, null];

  const firstAlu: AluLane[] = [0, 1, 2, 3].map((i) => ({
    parts: [CONV_A[i], CONV_A[i + 1], CONV_A[i + 2]],
    result: beat >= 4 ? CONV_C[i] : null,
  }));
  const tailAlu: AluLane[] = [0, 1, 2, 3].map((i) => {
    if (i >= 2) {
      return { parts: [], result: null, masked: true };
    }
    return {
      parts: [CONV_A[4 + i], CONV_A[5 + i], CONV_A[6 + i]],
      result: beat >= 7 ? CONV_C[4 + i] : null,
    };
  });

  const copy = CONV_BEATS[beat] ?? CONV_BEATS[0];
  return {
    ...copy,
    formula: "C[i] = A[i−1] + A[i] + A[i+1]",
    op: "vadd + vadd",
    dramA: CONV_A,
    dramB: null,
    dramC,
    vmA,
    vmB: null,
    vmC,
    regs: [
      { name: "vL", values: vL },
      { name: "vMid", values: vMid },
      { name: "vR", values: vR },
      { name: "vOut", values: vOut },
    ],
    alu: beat === 3 ? firstAlu.map((lane) => ({ ...lane, result: null })) : beat === 4 || beat === 5 ? firstAlu : beat >= 6 ? tailAlu : null,
    hotDram:
      beat === 1 || beat === 2
        ? { vec: "A", start: 0, len: CONV_N }
        : beat === 3
          ? { vec: "A", start: 0, len: 6 }
          : beat === 6
            ? { vec: "A", start: 4, len: 4 }
            : beat === 9
              ? { vec: "C", start: 1, len: 6 }
              : null,
    hotVm:
      beat === 2
        ? { vec: "A", start: 0, len: CONV_N }
        : beat === 3
          ? { vec: "A", start: 0, len: 6 }
          : beat === 5
            ? { vec: "C", start: 1, len: 4 }
            : beat === 6
              ? { vec: "A", start: 4, len: 4 }
              : beat === 8
                ? { vec: "C", start: 5, len: 2 }
                : null,
    hotRegs:
      beat === 3
        ? ["vL", "vMid", "vR"]
        : beat === 4 || beat === 7
          ? ["vOut"]
          : beat === 6
            ? ["vL", "vMid", "vR"]
            : [],
    halo: beat >= 1 ? [0, 7] : null,
    avl: beat >= 9 ? 0 : beat >= 6 ? 2 : 6,
    vl: beat >= 6 ? 2 : beat >= 3 ? 4 : 0,
  };
}

const CONV_BEATS: Pick<Scene, "caption" | "changed" | "hop">[] = [
  {
    hop: "dram",
    caption:
      "1D convolution: each output is a pixel plus its left and right neighbors. Kernel = [1, 1, 1].",
    changed: "—",
  },
  {
    hop: "dram",
    caption:
      "Valid outputs sit on A[1..6]. Staging that tile also needs a 1-element halo on each side: A[0] and A[7].",
    changed: "halo = {A[0], A[7]}   valid = A[1..6]",
  },
  {
    hop: "vm",
    caption:
      "Memory tiling: load the neighborhood (tile + halo) from DRAM into Vector Memory.",
    changed: "VM.A[0..7] = DRAM.A[0..7]",
  },
  {
    hop: "reg",
    caption:
      "Register tiling: AVL=6 outputs, vsetvli grants VL=4. Load three shifted windows.",
    changed: "vL=A[0..3]  vMid=A[1..4]  vR=A[2..5]   VL=4  AVL=6",
  },
  {
    hop: "alu",
    caption: "ALU adds the three windows. Four outputs appear in one step.",
    changed: "vOut = vL + vMid + vR = [6, 9, 12, 15]",
  },
  {
    hop: "vm",
    caption: "Store the first four outputs under the center pixels A[1..4].",
    changed: "VM.C[1..4] = vOut",
  },
  {
    hop: "reg",
    caption:
      "Tail: AVL=2, hardware grants VL=2. Lanes 2–3 stay masked. Load the last two windows.",
    changed: "vL=A[4..5]  vMid=A[5..6]  vR=A[6..7]   VL=2  AVL=2",
  },
  {
    hop: "alu",
    caption: "ALU computes the leftover two outputs. No scalar cleanup loop.",
    changed: "vOut = [18, 21]   lanes 2–3 masked",
  },
  {
    hop: "vm",
    caption: "Store the tail. The whole C tile now sits in fast memory.",
    changed: "VM.C[5..6] = vOut",
  },
  {
    hop: "writeback",
    caption: "Write C from Vector Memory back to DRAM. Halo cells are not outputs.",
    changed: "DRAM.C[1..6] = VM.C[1..6]",
  },
];

function sceneCount(kernel: KernelId) {
  return kernel === "add" ? ADD_BEATS.length : CONV_BEATS.length;
}

function sceneAt(kernel: KernelId, beat: number): Scene {
  return kernel === "add" ? addScene(beat) : addSceneConv(beat);
}

function isHot(hot: Hot | null, vec: VecId, index: number) {
  return Boolean(hot && hot.vec === vec && index >= hot.start && index < hot.start + hot.len);
}

function Cell({
  value,
  kind,
  hot,
  halo,
  masked,
}: {
  value: number | null;
  kind: "a" | "b" | "c";
  hot?: boolean;
  halo?: boolean;
  masked?: boolean;
}) {
  return (
    <span
      className={cx(
        styles.cell,
        value == null || masked ? styles.empty : styles[kind],
        hot && styles.hot,
        halo && styles.halo,
        masked && styles.masked,
      )}
    >
      {masked ? "—" : value == null ? "·" : value}
    </span>
  );
}

function vecFromName(name: string): VecId {
  if (name === "B" || name === "vB" || name === "vR") return "B";
  if (name === "C" || name === "vC" || name === "vOut") return "C";
  return "A";
}

function Strip({
  name,
  values,
  kind,
  hot,
  halo,
  vl,
  lit,
}: {
  name: string;
  values: Slots;
  kind: "a" | "b" | "c";
  hot?: Hot | null;
  halo?: number[] | null;
  vl?: number;
  lit?: boolean;
}) {
  const vec = vecFromName(name);
  const groups: number[][] = [];
  for (let i = 0; i < values.length; i += VLMAX) {
    groups.push(Array.from({ length: Math.min(VLMAX, values.length - i) }, (_, k) => i + k));
  }
  return (
    <div className={cx(styles.strip, lit && styles.stripLit)}>
      <span className={styles.vecName}>{name}</span>
      <div className={styles.groups}>
        {groups.map((indexes) => (
          <div key={indexes[0]} className={styles.group}>
            {indexes.map((index) => (
              <Cell
                key={index}
                value={values[index]}
                kind={kind}
                hot={lit || isHot(hot ?? null, vec, index)}
                halo={halo?.includes(index)}
                masked={vl != null && index >= vl}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Zone({
  hop,
  active,
  icon,
  title,
  hint,
  children,
}: {
  hop: Hop;
  active: boolean;
  icon: ReactNode;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className={cx("panel", styles.zone, styles[hop], active && styles.zoneOn)}>
      <header className={styles.zoneHead}>
        <span className={styles.icon}>{icon}</span>
        <div>
          <h3>{title}</h3>
          <p>{hint}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function AluPanel({ lanes: aluLanes, op }: { lanes: AluLane[] | null; op: string }) {
  const rows: AluLane[] = aluLanes ?? Array.from({ length: VLMAX }, () => ({ parts: [], result: null }));
  return (
    <div className={styles.aluList}>
      <p className={styles.opChip}>{op}</p>
      {rows.map((lane, i) => (
        <p key={i} className={cx(styles.eq, lane.masked && styles.masked, lane.result != null && styles.eqDone)}>
          <span className={styles.laneTag}>lane {i}</span>
          {lane.masked ? (
            "masked"
          ) : lane.parts.length === 0 ? (
            "·  +  ·  =  ·"
          ) : (
            <>
              {lane.parts.join(" + ")}
              {" = "}
              <strong>{lane.result == null ? "?" : lane.result}</strong>
            </>
          )}
        </p>
      ))}
    </div>
  );
}

export default function TilingDeck() {
  const [kernel, setKernel] = useState<KernelId>("add");
  const [beat, setBeat] = useState(0);
  const last = sceneCount(kernel) - 1;
  const scene = useMemo(() => sceneAt(kernel, beat), [kernel, beat]);

  const goKernel = (id: KernelId) => {
    setKernel(id);
    setBeat(0);
  };

  const prev = useCallback(() => {
    setBeat((value) => Math.max(0, value - 1));
  }, []);

  const next = useCallback(() => {
    setBeat((value) => Math.min(last, value + 1));
  }, [last]);

  const reset = useCallback(() => {
    setBeat(0);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        prev();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const activeHop = scene.hop;
  const zoneActive = (hop: Hop) =>
    activeHop === hop || (hop === "dram" && activeHop === "writeback");

  return (
    <div className={styles.page}>
      <nav className={styles.kernelTabs} aria-label="Kernel examples">
        {KERNEL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={cx(styles.kernelTab, kernel === tab.id && styles.kernelOn)}
            aria-current={kernel === tab.id ? "page" : undefined}
            onClick={() => goKernel(tab.id)}
          >
            {tab.label}
            <small>{tab.formula}</small>
          </button>
        ))}
      </nav>

      <header className={`panel ${styles.bar}`}>
        <p className={styles.watching}>
          <strong>Now watching. </strong>
          {scene.caption}
        </p>
        <div className={styles.nav}>
          <button type="button" className="btn" onClick={reset} disabled={beat === 0}>
            Reset
          </button>
          <button type="button" className="btn" onClick={prev} disabled={beat === 0}>
            Back
          </button>
          <span className={styles.counter}>
            {beat + 1} / {last + 1}
          </span>
          <button
            type="button"
            className="btn primary"
            onClick={next}
            disabled={beat >= last}
          >
            Step into
          </button>
        </div>
      </header>

      <ol className={styles.ribbon} aria-label="Data path">
        {HOPS.map((hop, index) => (
          <li key={hop.id} className={cx(styles.hop, activeHop === hop.id && styles.hopOn)}>
            {index > 0 ? <span className={styles.hopArrow} aria-hidden>→</span> : null}
            {hop.label}
          </li>
        ))}
      </ol>

      <div className={styles.pipeline}>
        <Zone
          hop="dram"
          active={zoneActive("dram")}
          icon={<Database size={16} />}
          title="Main Memory"
          hint="DRAM · slow"
        >
          <Strip name="A" values={scene.dramA} kind="a" hot={scene.hotDram} halo={scene.halo} />
          {scene.dramB ? (
            <Strip name="B" values={scene.dramB} kind="b" hot={scene.hotDram} />
          ) : (
            <p className={styles.note}>
              Kernel [1, 1, 1] · outputs sit on A[1..6]
            </p>
          )}
          <Strip name="C" values={scene.dramC} kind="c" hot={scene.hotDram} />
        </Zone>

        <Zone
          hop="vm"
          active={zoneActive("vm")}
          icon={<MemoryStick size={16} />}
          title="Fast Memory"
          hint="Vector Memory · on-chip tile"
        >
          <Strip name="A" values={scene.vmA} kind="a" hot={scene.hotVm} halo={scene.halo} />
          {scene.vmB ? <Strip name="B" values={scene.vmB} kind="b" hot={scene.hotVm} /> : null}
          <Strip name="C" values={scene.vmC} kind="c" hot={scene.hotVm} />
        </Zone>

        <Zone
          hop="reg"
          active={zoneActive("reg")}
          icon={<Cpu size={16} />}
          title="Vector Registers"
          hint={`VLMAX = ${VLMAX} · AVL ${scene.avl} → VL ${scene.vl || "—"}`}
        >
          {scene.regs.map((reg) => (
            <Strip
              key={reg.name}
              name={reg.name}
              values={reg.values}
              kind={reg.name === "vB" || reg.name === "vR" ? "b" : reg.name === "vC" || reg.name === "vOut" ? "c" : "a"}
              vl={scene.vl > 0 ? scene.vl : undefined}
              lit={scene.hotRegs.includes(reg.name)}
            />
          ))}
        </Zone>

        <Zone
          hop="alu"
          active={zoneActive("alu")}
          icon={<Sigma size={16} />}
          title="ALU"
          hint={scene.formula}
        >
          <AluPanel lanes={scene.alu} op={scene.op} />
        </Zone>
      </div>

      <p className={`panel ${styles.changed}`}>
        <span>What changed</span>
        <AnimatePresence mode="wait">
          <motion.code
            key={`${kernel}-${beat}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            {scene.changed}
          </motion.code>
        </AnimatePresence>
      </p>
    </div>
  );
}
