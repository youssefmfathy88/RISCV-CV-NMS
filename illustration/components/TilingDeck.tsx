"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Cpu, Database, MemoryStick, Sigma } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { beatsFor, TILING_DECKS, TILING_KERNELS } from "@/lib/tiling";
import { VCCM } from "@/lib/tiling/canvas";
import type { AluLane, BoxChip, Budget, Cell, Grid, Hop, KernelId, LessonMode, Scene, Strip } from "@/lib/tiling/types";
import { VLMAX } from "@/lib/tiling/types";
import styles from "./TilingDeck.module.css";

const HOPS: { id: Hop; label: string }[] = [
  { id: "dram", label: "Main Memory" },
  { id: "vm", label: "Fast Memory" },
  { id: "reg", label: "Vector Registers" },
  { id: "alu", label: "ALU" },
  { id: "writeback", label: "Back to Memory" },
];

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function CellView({ item, valid }: { item: Cell; valid?: boolean }) {
  return (
    <span
      className={cx(
        styles.cell,
        item.tone === "empty" || item.masked ? styles.empty : styles[item.tone],
        item.hot && styles.hot,
        item.masked && styles.masked,
        (valid || item.valid) && styles.valid,
      )}
    >
      {item.masked ? "—" : item.text}
    </span>
  );
}

function StripView({ item }: { item: Strip }) {
  const groupSize = item.group ?? VLMAX;
  const groups: number[][] = [];
  for (let index = 0; index < item.cells.length; index += groupSize) {
    groups.push(
      Array.from({ length: Math.min(groupSize, item.cells.length - index) }, (_, offset) => index + offset),
    );
  }
  return (
    <div className={cx(styles.strip, item.lit && styles.stripLit)}>
      <span className={styles.vecName}>{item.name}</span>
      <div
        className={cx(
          styles.track,
          item.bracket === "exact" && styles.exact,
          item.bracket === "max" && styles.max,
        )}
      >
        {groups.map((indexes) => (
          <div key={indexes[0]} className={styles.group}>
            {indexes.map((index) => (
              <CellView
                key={index}
                item={item.cells[index]}
                valid={item.bracket === "max" && index < (item.valid ?? 0)}
              />
            ))}
          </div>
        ))}
      </div>
      {item.full ? <span className={styles.full}>full</span> : null}
    </div>
  );
}

function GridView({ grid }: { grid: Grid }) {
  return (
    <div className={cx(styles.gridBlock, grid.lit && styles.stripLit)}>
      {grid.name ? <span className={styles.vecName}>{grid.name}</span> : null}
      <div
        className={cx(
          styles.grid,
          grid.bracket === "exact" && styles.exact,
          grid.bracket === "max" && styles.max,
        )}
      >
        {grid.rows.map((row, y) => (
          <div
            key={y}
            className={styles.memRow}
            style={{ gridTemplateColumns: `repeat(${row.length}, var(--pitch))` }}
          >
            {row.map((item, x) => (
              <CellView key={x} item={item} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MatrixProduct({ factors, framed = false }: { factors: Grid[]; framed?: boolean }) {
  const ops = ["×", "="];
  return (
    <div className={cx(styles.logicalBlock, framed && `panel ${styles.productPanel}`)}>
      <p className={styles.logicalLabel}>Logical · A × B = C</p>
      <div className={styles.product}>
        {factors.map((grid, index) => (
          <div key={grid.name} className={styles.matrixWrap}>
            {index > 0 ? <span className={styles.productOp}>{ops[index - 1]}</span> : null}
            <div className={styles.matrix}>
              <span className={styles.logicalLabel}>{grid.name}</span>
              <GridView grid={{ ...grid, name: "" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogicalPicture({ scene }: { scene: Scene }) {
  if (scene.product && scene.product.length === 3) {
    return <MatrixProduct factors={scene.product} />;
  }
  if (!scene.logical) {
    return null;
  }
  return (
    <div className={styles.logicalBlock}>
      <p className={styles.logicalLabel}>Logical · {scene.logical.name}</p>
      <GridView grid={{ ...scene.logical, name: "" }} />
    </div>
  );
}

function ContiguousMemory({ grid, label }: { grid: Grid; label: string }) {
  return (
    <div className={styles.realBlock}>
      <p className={styles.logicalLabel}>{label}</p>
      <div className={cx(styles.contig, grid.lit && styles.stripLit)}>
        {grid.rows.flat().map((item, index) => (
          <CellView key={index} item={item} />
        ))}
      </div>
    </div>
  );
}

function Weights({ weights }: { weights: number[][] }) {
  const size =
    weights.length === 1 ? String(weights[0].length) : `${weights.length}×${weights[0].length}`;
  return (
    <div className={styles.weights}>
      <span className={styles.kBadge}>K = {size}</span>
      <div className={styles.grid}>
        {weights.map((row, y) => (
          <div key={y} className={styles.group}>
            {row.map((value, x) => (
              <CellView key={x} item={{ text: String(value), tone: "b" }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Overlap({ boxes }: { boxes: BoxChip[] }) {
  const clusters: number[] = [];
  boxes.forEach((box) => {
    if (!clusters.includes(box.cluster)) {
      clusters.push(box.cluster);
    }
  });
  return (
    <div className={styles.overlap}>
      {clusters.map((cluster) => (
        <div key={cluster} className={styles.cluster}>
          {boxes
            .filter((box) => box.cluster === cluster)
            .map((box) => (
              <span key={box.index} className={styles.boxChip} data-state={box.state}>
                {box.index}
                <small>{box.score}</small>
              </span>
            ))}
        </div>
      ))}
    </div>
  );
}

function AluPanel({ lanes, op }: { lanes: AluLane[] | null; op: string }) {
  const rows: AluLane[] =
    lanes ??
    Array.from({ length: VLMAX }, (_, index) => ({
      label: `lane ${index}`,
      expr: "·",
      result: null,
    }));
  return (
    <div className={styles.aluList}>
      <p className={styles.opChip}>{op}</p>
      {rows.map((lane) => (
        <p
          key={lane.label}
          className={cx(styles.eq, lane.masked && styles.masked, lane.result != null && styles.eqDone)}
        >
          <span className={styles.laneTag}>{lane.label}</span>
          {lane.masked ? (
            "masked"
          ) : lane.expr === "·" ? (
            "·"
          ) : (
            <>
              {lane.expr}
              {lane.result != null ? (
                <>
                  {" = "}
                  <strong className={lane.result === "drop" ? styles.dropText : undefined}>
                    {lane.result}
                  </strong>
                </>
              ) : null}
            </>
          )}
        </p>
      ))}
    </div>
  );
}

function BudgetChip({ budget }: { budget: Budget }) {
  return (
    <p className={styles.budget}>
      <span>
        {budget.input} + {budget.output} + {budget.pad} ≤ {VCCM}
      </span>
      <span>moved {budget.moved}</span>
      <span>
        {budget.used}/{VCCM}
      </span>
      {budget.remainder ? <span className={styles.full}>remainder</span> : null}
    </p>
  );
}

function Zone({
  hop,
  active,
  icon,
  title,
  hint,
  badge,
  children,
}: {
  hop: Hop;
  active: boolean;
  icon: ReactNode;
  title: string;
  hint: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx("panel", styles.zone, styles[hop], active && styles.zoneOn)}>
      <header className={styles.zoneHead}>
        <span className={styles.icon}>{icon}</span>
        <div>
          <h3>
            {title}
            {badge ? <span className={styles.full}>{badge}</span> : null}
          </h3>
          <p>{hint}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

export default function TilingDeck() {
  const [kernel, setKernel] = useState<KernelId>("add");
  const [mode, setMode] = useState<LessonMode>("scalar");
  const [beat, setBeat] = useState(0);
  const scalarOn = TILING_DECKS[kernel].scalar.length > 0;
  const activeMode: LessonMode = scalarOn ? mode : "tiling";
  const scenes = useMemo(() => beatsFor(kernel, activeMode), [kernel, activeMode]);
  const last = scenes.length - 1;
  const scene: Scene = scenes[Math.min(beat, last)];

  const goKernel = (id: KernelId) => {
    setKernel(id);
    setBeat(0);
    if (TILING_DECKS[id].scalar.length === 0) {
      setMode("tiling");
    }
  };

  const goMode = (nextMode: LessonMode) => {
    setMode(nextMode);
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
  const zoneActive = (hop: Hop) => activeHop === hop || (hop === "dram" && activeHop === "writeback");

  return (
    <div className={styles.page}>
      <nav className={styles.kernelTabs} aria-label="Kernel examples">
        {TILING_KERNELS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={cx(styles.kernelTab, kernel === tab.id && styles.kernelOn)}
            aria-current={kernel === tab.id ? "page" : undefined}
            onClick={() => goKernel(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {scalarOn ? (
      <nav className={styles.modeTabs} aria-label="Lesson mode">
        {(["scalar", "tiling"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={cx(styles.kernelTab, mode === item && styles.kernelOn)}
            aria-current={mode === item ? "page" : undefined}
            onClick={() => goMode(item)}
          >
            {item === "scalar" ? "Scalar" : "Tiling"}
          </button>
        ))}
      </nav>
      ) : null}
      <header className={`panel ${styles.bar}`}>
        <p className={styles.watching}>
          <strong>{scene.title}</strong>
          <span className={styles.constraint}>{scene.constraint}</span>
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
          <button type="button" className="btn primary" onClick={next} disabled={beat >= last}>
            Step into
          </button>
        </div>
      </header>

      {activeMode === "tiling" ? (
        <ol className={styles.ribbon} aria-label="Data path">
          {HOPS.map((hop, index) => (
            <li key={hop.id} className={cx(styles.hop, activeHop === hop.id && styles.hopOn)}>
              {index > 0 ? (
                <span className={styles.hopArrow} aria-hidden>
                  →
                </span>
              ) : null}
              {hop.label}
            </li>
          ))}
        </ol>
      ) : null}

      {activeMode === "scalar" ? (
        <section className={`panel ${styles.scalarBoard}`}>
          {scene.boxes ? <Overlap boxes={scene.boxes} /> : null}
          {scene.weights ? <Weights weights={scene.weights} /> : null}
          <LogicalPicture scene={scene} />
          <GridView grid={scene.main} />
        </section>
      ) : (
      <div className={styles.tilingBoard}>
      {scene.equation ? (
        <div className={`panel ${styles.equation}`}>
          {scene.equation.map((line) => (
            <code key={line}>{line}</code>
          ))}
        </div>
      ) : null}
      {scene.product && scene.product.length === 3 ? <MatrixProduct factors={scene.product} framed /> : null}
      <div className={styles.pipeline}>
        <Zone
          hop="dram"
          active={zoneActive("dram")}
          icon={<Database size={16} />}
          title="Main Memory"
          hint="DRAM"
          badge={scene.mark === "flush" ? "flush" : undefined}
        >
          {scene.boxes ? <Overlap boxes={scene.boxes} /> : null}
          {scene.product ? null : <LogicalPicture scene={scene} />}
          <ContiguousMemory grid={scene.main} label="Real Memory (contiguous) data" />
        </Zone>

        <Zone
          hop="vm"
          active={zoneActive("vm")}
          icon={<MemoryStick size={16} />}
          title="Fast Memory"
          hint={`VCCM · ${VCCM} slots`}
          badge={
            scene.budget?.remainder
              ? "remainder"
              : scene.mark === "inject"
                ? "inject"
                : scene.full
                  ? "full"
                  : undefined
          }
        >
          {scene.budget ? <BudgetChip budget={scene.budget} /> : null}
          <ContiguousMemory grid={scene.fast} label="Fast Memory (contiguous) data" />
        </Zone>

        <Zone
          hop="reg"
          active={zoneActive("reg")}
          icon={<Cpu size={16} />}
          title="Vector Registers"
          hint={`VLMAX = ${VLMAX} · AVL ${scene.avl} → VL ${scene.vl || "—"}`}
        >
          {scene.regs.map((item) => (
            <StripView key={item.name} item={item} />
          ))}
          {scene.acc ? (
            <div className={cx(styles.strip, scene.acc.hot && styles.stripLit)}>
              <span className={styles.vecName}>{scene.acc.name}</span>
              <span className={cx(styles.cell, styles.c, scene.acc.hot && styles.hot)}>{scene.acc.text}</span>
            </div>
          ) : null}
        </Zone>

        <Zone hop="alu" active={zoneActive("alu")} icon={<Sigma size={16} />} title="ALU" hint={scene.formula}>
          {scene.weights ? <Weights weights={scene.weights} /> : null}
          <AluPanel lanes={scene.alu} op={scene.op} />
        </Zone>
      </div>
      </div>
      )}

      <p className={`panel ${styles.changed}`}>
        <span>What changed</span>
        <AnimatePresence mode="wait">
          <motion.code
            key={`${kernel}-${activeMode}-${beat}`}
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
