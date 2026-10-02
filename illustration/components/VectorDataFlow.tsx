"use client";

import { MemoryBlock, RegisterBlock } from "@/components/LaneCells";
import type { VectorStep } from "@/lib/vectorTrace";
import styles from "./VectorDataFlow.module.css";

export default function VectorDataFlow({ step }: { step: VectorStep }) {
  return (
    <div className={styles.page}>
      <div className={styles.meta}>
        <span>
          VLMAX <strong>{step.vlmax}</strong>
        </span>
        <span>
          remaining <strong>{step.remaining}</strong>
        </span>
        <span>
          offset <strong>{step.offset}</strong>
        </span>
        <span>
          vl <strong>{step.vl}</strong>
        </span>
        <span>
          strip <strong>{step.strip}</strong>
        </span>
        <span>
          {step.sewmLmul}
        </span>
      </div>

      <div className={styles.cards}>
        <p className={styles.card}>
          <span>What it does</span>
          {step.whatItDoes}
        </p>
        <p className={styles.card}>
          <span>Why it is needed</span>
          {step.whyNeeded}
        </p>
        <p className={styles.card}>
          <span>Lane rule</span>
          {step.laneRule}
        </p>
      </div>

      {step.flow ? <p className={styles.flow}>{step.flow}</p> : null}

      {step.registers.map((register) => (
        <RegisterBlock key={register.name} register={register} />
      ))}

      {step.memories.map((memory) => (
        <MemoryBlock key={`${memory.name}-${memory.hint ?? ""}`} memory={memory} />
      ))}

      {step.checkpoint ? (
        <p className={`${styles.checkpoint} ${step.checkpoint.ok ? "" : styles.bad}`}>
          {step.checkpoint.ok ? "Checkpoint. " : "Mismatch. "}
          {step.checkpoint.label}: {step.checkpoint.detail}
        </p>
      ) : null}
    </div>
  );
}
