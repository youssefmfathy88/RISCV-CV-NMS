import Link from "next/link";
import styles from "../home.module.css";

const LESSONS = [
  {
    href: "/tiling/deck",
    title: "Examples",
    body: "Add, ReduceSum, Matmul, Softmax, Conv 1D, and NonZero. Step the same memory picture for each.",
  },
];

export default function TilingOverviewPage() {
  return (
    <div className={styles.home}>
      <p className={styles.kicker}>Concepts · vectorization tiling</p>
      <h1>Vectorization Tiling</h1>
      <p className={styles.lead}>
        One path: main memory, fast memory, vector registers, the ALU, then
        back. Add, ReduceSum, Matmul, and Softmax know their output size. Conv 1D
        injects padding in fast memory. NonZero reserves the maximum and flushes
        when fast memory fills.
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
