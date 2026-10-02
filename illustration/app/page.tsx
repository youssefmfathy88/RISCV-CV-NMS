import KernelCard from "@/components/KernelCard";
import { KERNELS } from "@/lib/kernels";
import styles from "./home.module.css";

export default function HomePage() {
  return (
    <div className={styles.home}>
      <p className={styles.kicker}>RISC-V CV · kernel sessions</p>
      <h1>Kernel walkthroughs</h1>
      <p className={styles.lead}>
        Interactive labs for the educational kernels. Open a session. NMS splits{" "}
        <strong>Concepts</strong> (boxes + IoU + sort) from a{" "}
        <strong>walkthrough</strong> with Scalar and Vector modes on every
        algorithm stage.
      </p>

      <div className={styles.grid}>
        {KERNELS.map((kernel) => (
          <KernelCard key={kernel.id} kernel={kernel} />
        ))}
      </div>
    </div>
  );
}
