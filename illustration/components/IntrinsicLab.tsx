"use client";

import LessonBoard from "@/components/LessonBoard";
import {
  FAMILIES,
  slidesForFamily,
  type AnimKind,
  type DemoMemory,
  type DemoRegister,
  type FamilyId,
  type IntrinsicSlide,
} from "@/lib/nmsIntrinsics";
import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import styles from "./IntrinsicLab.module.css";

type Phase = "idle" | "inputs" | "operate" | "result";

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function reducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function reducedMotionServerSnapshot() {
  return false;
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    reducedMotionSnapshot,
    reducedMotionServerSnapshot,
  );
}

export default function IntrinsicLab() {
  const [family, setFamily] = useState<FamilyId>("vl");
  const [index, setIndex] = useState(0);
  const [playNonce, setPlayNonce] = useState(0);

  const slides = useMemo(() => slidesForFamily(family), [family]);
  const last = Math.max(0, slides.length - 1);
  const safeIndex = Math.min(index, last);
  const slide = slides[safeIndex];

  const replay = () => setPlayNonce((nonce) => nonce + 1);

  if (!slide) {
    return <p>No slides in this family.</p>;
  }

  return (
    <div className={styles.page}>
      <LessonBoard
        watching={slide.watching}
        fn={`rvv::${slide.helper}`}
        index={safeIndex}
        total={slides.length}
        onReset={() => {
          setIndex(0);
          replay();
        }}
        onPrev={() => {
          setIndex(Math.max(0, safeIndex - 1));
          replay();
        }}
        onNext={() => {
          setIndex(Math.min(last, safeIndex + 1));
          replay();
        }}
        code={slide.snippet}
        highlightLine={slide.highlightLine}
        changed={slide.changed}
        extraBar={
          <ExtraBar
            family={family}
            slides={slides}
            selectedId={slide.id}
            onFamily={(id) => {
              setFamily(id);
              setIndex(0);
              replay();
            }}
            onHelper={(nextIndex) => {
              setIndex(nextIndex);
              replay();
            }}
            onReplay={replay}
          />
        }
        data={
          <IntrinsicAnimator
            key={`${slide.id}-${playNonce}`}
            slide={slide}
          />
        }
      />
    </div>
  );
}

function ExtraBar({
  family,
  slides,
  selectedId,
  onFamily,
  onHelper,
  onReplay,
}: {
  family: FamilyId;
  slides: IntrinsicSlide[];
  selectedId: string;
  onFamily: (id: FamilyId) => void;
  onHelper: (index: number) => void;
  onReplay: () => void;
}) {
  const selected = slides.find((item) => item.id === selectedId);
  return (
    <div className={styles.extra}>
      <div className={styles.toolbar}>
        <ol className={styles.pills}>
          {FAMILIES.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={family === item.id ? styles.on : undefined}
                onClick={() => onFamily(item.id)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="btn" onClick={onReplay}>
          Replay
        </button>
      </div>
      <ol className={styles.pills}>
        {slides.map((item, slideIndex) => (
          <li key={item.id}>
            <button
              type="button"
              className={item.id === selectedId ? styles.vectorOn : undefined}
              onClick={() => onHelper(slideIndex)}
            >
              {item.helper}
            </button>
          </li>
        ))}
      </ol>
      {selected ? (
        <p className={styles.used}>
          Used in {selected.usedIn.join(", ")}.
          {selected.also && selected.also.length > 1
            ? ` Wrappers: ${selected.also.join(", ")}.`
            : null}
        </p>
      ) : null}
    </div>
  );
}

function IntrinsicAnimator({ slide }: { slide: IntrinsicSlide }) {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    if (reduced) {
      return;
    }
    const inputs = window.setTimeout(() => setPhase("inputs"), 80);
    const operate = window.setTimeout(() => setPhase("operate"), 720);
    const result = window.setTimeout(() => setPhase("result"), 1580);
    return () => {
      window.clearTimeout(inputs);
      window.clearTimeout(operate);
      window.clearTimeout(result);
    };
  }, [reduced]);

  const viewPhase: Phase = reduced ? "result" : phase;
  const keep = keepBits(slide);
  const showAfter = viewPhase === "operate" || viewPhase === "result";

  return (
    <div className={`${styles.flow} ${styles[phaseClass(viewPhase)]}`}>
      <div className={styles.meta}>
        <span>
          VLMAX <strong>{slide.vlmax}</strong>
        </span>
        {slide.remaining != null ? (
          <span>
            remaining <strong>{slide.remaining}</strong>
          </span>
        ) : null}
        <span>
          vl <strong>{slide.vl}</strong>
        </span>
        <span>{slide.sewmLmul}</span>
      </div>
      <div className={styles.cards}>
        <p className={styles.card}>
          <span>What it does</span>
          {slide.whatItDoes}
        </p>
        <p className={styles.card}>
          <span>Lane rule</span>
          {slide.laneRule}
        </p>
      </div>
      {slide.flow ? <p className={styles.arrow}>{slide.flow}</p> : null}
      {slide.registers.map((register) => (
        <RegisterBlock
          key={register.name}
          register={register}
          phase={viewPhase}
          showAfter={showAfter}
          anim={slide.anim}
          keep={keep}
          vl={slide.vl}
        />
      ))}
      {slide.memories.map((memory) => (
        <MemoryBlock
          key={memory.name}
          memory={memory}
          phase={viewPhase}
          anim={slide.anim}
        />
      ))}
    </div>
  );
}

function keepBits(slide: IntrinsicSlide): boolean[] {
  const mask = slide.registers.find((register) => register.kind === "mask");
  if (!mask) {
    return [];
  }
  const values = mask.role === "dst" ? mask.after : mask.before;
  return values.map((value) => value === "true");
}

function phaseClass(phase: Phase): string {
  if (phase === "inputs") {
    return "phaseInputs";
  }
  if (phase === "operate") {
    return "phaseOperate";
  }
  if (phase === "result") {
    return "phaseResult";
  }
  return "phaseIdle";
}

function scalarShown(
  register: DemoRegister,
  phase: Phase,
  showAfter: boolean,
): string | undefined {
  if (register.role === "dst") {
    return showAfter ? register.scalarAfter : register.scalarBefore;
  }
  if (phase === "result") {
    return register.scalarAfter ?? register.scalarBefore;
  }
  return register.scalarBefore;
}

function laneShown(
  register: DemoRegister,
  lane: number,
  phase: Phase,
  showAfter: boolean,
  anim: AnimKind,
): string {
  const before = register.before[lane] ?? "—";
  const after = register.after[lane] ?? "—";
  if (register.role === "dst") {
    return showAfter ? after : before;
  }
  if (anim === "compress" && register.role === "src") {
    return before;
  }
  return phase === "result" ? after : before;
}

function RegisterBlock({
  register,
  phase,
  showAfter,
  anim,
  keep,
  vl,
}: {
  register: DemoRegister;
  phase: Phase;
  showAfter: boolean;
  anim: AnimKind;
  keep: boolean[];
  vl: number;
}) {
  if (register.kind === "scalar") {
    const shown = scalarShown(register, phase, showAfter);
    return (
      <section className={styles.block}>
        <h3 className={styles.label}>scalar {register.name}</h3>
        <div
          className={`${styles.scalar} ${
            phase !== "idle" && (register.role === "src" || register.role === "aux")
              ? styles.hl
              : ""
          } ${phase === "result" && register.role === "dst" ? styles.changed : ""}`}
        >
          {shown}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.block}>
      <h3 className={styles.label}>
        {register.kind === "mask" ? "mask" : "vector"} {register.name}
      </h3>
      <div className={styles.lanes}>
        {register.before.map((_, lane) => {
          const before = register.before[lane] ?? "—";
          const after = register.after[lane] ?? "—";
          const value = laneShown(register, lane, phase, showAfter, anim);
          const active = lane < vl && value !== "—";
          const compressSrc = anim === "compress" && register.role === "src";
          const kept = keep[lane] === true;
          const dx =
            compressSrc && phase === "operate" && kept
              ? packedIndex(keep, lane) - lane
              : 0;
          const drop =
            compressSrc && phase === "operate" && keep.length > 0 && !kept;
          const first = firstTrueIndex(register, anim, phase);
          const style: CSSProperties | undefined =
            compressSrc && phase === "operate" && kept
              ? ({ "--dx": String(dx) } as CSSProperties)
              : undefined;
          return (
            <div
              key={`${register.name}-${lane}`}
              className={[
                styles.lane,
                active ? "" : styles.tail,
                highlightLane(register, lane, phase, anim, keep) || first === lane
                  ? styles.hl
                  : "",
                phase === "result" && register.role === "dst" && after !== before
                  ? styles.changed
                  : "",
                register.kind === "mask" && value === "true" ? styles.maskTrue : "",
                register.kind === "mask" && value === "false" ? styles.maskFalse : "",
                drop ? styles.drop : "",
                compressSrc && phase === "operate" && kept ? styles.pack : "",
                register.role === "dst" && showAfter ? styles.pop : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={style}
            >
              <span>lane {lane}</span>
              <strong>{value}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function packedIndex(keep: boolean[], lane: number): number {
  return keep.slice(0, lane).filter(Boolean).length;
}

function firstTrueIndex(
  register: DemoRegister,
  anim: AnimKind,
  phase: Phase,
): number | null {
  if (anim !== "firstTrue" || register.kind !== "mask") {
    return null;
  }
  if (phase === "idle") {
    return null;
  }
  const idx = register.before.findIndex((value) => value === "true");
  return idx >= 0 ? idx : null;
}

function highlightLane(
  register: DemoRegister,
  lane: number,
  phase: Phase,
  anim: AnimKind,
  keep: boolean[],
): boolean {
  if (phase === "idle") {
    return false;
  }
  if (register.role === "src" || register.role === "aux" || register.role === "mask") {
    if (anim === "compress" && register.role === "src") {
      return keep[lane] === true && (phase === "inputs" || phase === "operate");
    }
    return phase === "inputs" || phase === "operate";
  }
  return false;
}

function MemoryBlock({
  memory,
  phase,
  anim,
}: {
  memory: DemoMemory;
  phase: Phase;
  anim: AnimKind;
}) {
  const showAfter = phase === "result";
  return (
    <section className={styles.block}>
      <h3 className={styles.label}>
        {memory.name}
        {memory.hint ? <span className={styles.hint}>{memory.hint}</span> : null}
      </h3>
      <div className={styles.cells}>
        {memory.cells.map((cell) => {
          const value = showAfter ? cell.after : cell.before;
          const hit = Boolean(cell.hit);
          const skipped =
            (anim === "stridedLoad" || anim === "stridedStore" || anim === "vl") &&
            !hit;
          const changed = showAfter && cell.after !== cell.before;
          const glow =
            hit &&
            (phase === "inputs" ||
              phase === "operate" ||
              (phase === "result" && (anim === "vl" || anim === "load" || anim === "gather")));
          return (
            <div
              key={`${memory.name}-${cell.index}`}
              className={[
                styles.cell,
                glow ? styles.hl : "",
                changed ? styles.changed : "",
                skipped ? styles.skip : "",
                hit && phase === "operate" ? styles.pulse : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span>{cell.label}</span>
              <strong>{value}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}
