import Link from "next/link";
import type { Kernel } from "@/lib/kernels";
import styles from "./KernelCard.module.css";

type Props = {
  kernel: Kernel;
};

export default function KernelCard({ kernel }: Props) {
  const href = `/${kernel.slug}`;
  const ready = kernel.status === "ready";
  return (
    <article className={`panel ${styles.card}`}>
      <div className={styles.top}>
        <h2>{kernel.title}</h2>
        <span className={ready ? styles.ready : styles.coming}>
          {ready ? "Ready" : "Coming"}
        </span>
      </div>
      {kernel.refSymbol ? (
        <p className={styles.symbol}>
          <code>{kernel.refSymbol}</code>
        </p>
      ) : null}
      <p>{kernel.summary}</p>
      <Link href={href} className={styles.go}>
        Open session →
      </Link>
    </article>
  );
}
