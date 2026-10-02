import Link from "next/link";
import styles from "../home.module.css";

const LESSONS = [
  {
    href: "/tiling/deck",
    title: "Examples",
    body: "Add two vectors, then a 1D convolution. One pipeline diagram, numbered cells, step into each move.",
  },
];

export default function TilingOverviewPage() {
  return (
    <div className={styles.home}>
      <p className={styles.kicker}>Concepts · vectorization tiling</p>
      <h1>Vectorization Tiling</h1>
      <p className={styles.lead}>
        Vector units are fast and DRAM is slow. Memory tiling stages a chunk
        through Vector Memory. Register tiling then strip-mines that tile with{" "}
        <code>vsetvli</code>. The path is always DRAM → Vector Memory → Vector
        Registers → ALU → DRAM.
      </p>

      <div className={styles.lessons}>
        {LESSONS.map((item) => (
          <Link key={item.href} href={item.href} className={`panel ${styles.lessonCard}`}>
            <h2>{item.title}</h2>
            <p>{item.body}</p>
            <span className={styles.go}>Open →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
