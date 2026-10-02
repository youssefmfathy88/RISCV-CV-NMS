"use client";

import type { CellRole, MemoryView, RegisterView } from "@/lib/vectorTrace";
import styles from "./VectorDataFlow.module.css";

function roleClass(role?: CellRole): string {
  if (role === "kept") {
    return styles.roleKept;
  }
  if (role === "compare") {
    return styles.roleCompare;
  }
  if (role === "kill") {
    return styles.roleKill;
  }
  if (role === "dead") {
    return styles.roleDead;
  }
  return "";
}

export function RegisterBlock({ register }: { register: RegisterView }) {
  return (
    <section className={styles.block}>
      <h3 className={styles.label}>
        {register.kind === "mask" ? "mask" : register.kind} {register.name}
      </h3>
      {register.kind === "scalar" ? (
        <div className={styles.scalar}>{register.scalar}</div>
      ) : (
        <div className={styles.lanes}>
          {register.lanes?.map((lane) => (
            <div
              key={`${register.name}-${lane.lane}`}
              className={[
                styles.lane,
                lane.active ? "" : styles.tail,
                lane.highlight ? styles.hl : "",
                roleClass(lane.role),
                register.kind === "mask" &&
                lane.active &&
                lane.value === "true" &&
                lane.role !== "kill"
                  ? styles.maskTrue
                  : "",
                register.kind === "mask" &&
                lane.active &&
                lane.value === "false" &&
                lane.role !== "kill"
                  ? styles.maskFalse
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span>lane {lane.lane}</span>
              <strong>{lane.value}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function MemoryBlock({ memory }: { memory: MemoryView }) {
  return (
    <section className={styles.block}>
      <h3 className={styles.label}>
        {memory.name}
        {memory.hint ? <span className={styles.hint}>{memory.hint}</span> : null}
      </h3>
      <div className={styles.cells}>
        {memory.cells.map((cell) => (
          <div
            key={`${memory.name}-${cell.index}`}
            className={[
              styles.cell,
              cell.highlight ? styles.hl : "",
              cell.changed ? styles.changed : "",
              roleClass(cell.role),
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span>{cell.label}</span>
            <strong>{cell.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
