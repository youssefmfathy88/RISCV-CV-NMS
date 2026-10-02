import type { Kernel } from "@/lib/kernels";
import styles from "./SessionPlaceholder.module.css";

type Props = {
  kernel: Kernel;
};

export default function SessionPlaceholder({ kernel }: Props) {
  return (
    <div className={styles.page}>
      <p className={styles.kicker}>Coming later</p>
      <h1>{kernel.title}</h1>
      {kernel.refSymbol ? (
        <p className={styles.symbol}>
          <code>{kernel.refSymbol}</code>
        </p>
      ) : null}
      <p>{kernel.summary}</p>
      <p>
        This session is a placeholder. Scalar walkthrough and vectorization labs
        will land here the same way NMS did: one kernel, step-by-step, numbers
        tied to the picture.
      </p>

      <section className={`panel ${styles.card}`}>
        <h2>Overview</h2>
        <p>Placeholder. What the kernel does and the function contract.</p>
      </section>
      <section className={`panel ${styles.card}`}>
        <h2>Scalar walkthrough</h2>
        <p>Placeholder. Step the <code>ref::</code> path with real arrays.</p>
      </section>
      <section className={`panel ${styles.card}`}>
        <h2>Vectorization</h2>
        <p>Placeholder. Later: the RISC-V Vector (<code>vec::</code>) version.</p>
      </section>
    </div>
  );
}
