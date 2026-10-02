"use client";

import styles from "./StepControls.module.css";

type Props = {
  index: number;
  total: number;
  playing: boolean;
  title: string;
  fn: string;
  explanation: string;
  snippet: string;
  onPrev: () => void;
  onNext: () => void;
  onPlay: () => void;
  onReset: () => void;
  nextDisabled?: boolean;
};

export default function StepControls({
  index,
  total,
  playing,
  title,
  fn,
  explanation,
  snippet,
  onPrev,
  onNext,
  onPlay,
  onReset,
  nextDisabled,
}: Props) {
  return (
    <section className={`panel ${styles.card}`}>
      <div className={styles.top}>
        <div>
          <div className={styles.fn}>{fn}</div>
          <h2>{title}</h2>
        </div>
        <div className={styles.counter}>
          {index + 1} / {total}
        </div>
      </div>
      <p>{explanation}</p>
      <pre className={styles.snippet}>
        <code>{snippet}</code>
      </pre>
      <div className={styles.buttons}>
        <button type="button" className="btn" onClick={onReset}>
          Reset
        </button>
        <button type="button" className="btn" onClick={onPrev} disabled={index === 0}>
          Prev
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={onPlay}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={onNext}
          disabled={nextDisabled || index >= total - 1}
        >
          Next
        </button>
      </div>
    </section>
  );
}
