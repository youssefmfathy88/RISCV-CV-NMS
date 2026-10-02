"use client";

import type { ReactNode } from "react";
import styles from "./LessonBoard.module.css";

type Props = {
  watching: string;
  fn?: string;
  index?: number;
  total?: number;
  onPrev?: () => void;
  onNext?: () => void;
  onReset?: () => void;
  nextDisabled?: boolean;
  code: string;
  highlightLine?: number;
  summarySteps?: { title: string; detail: string }[];
  summaryOnly?: boolean;
  data?: ReactNode;
  changed?: string;
  extraBar?: ReactNode;
};

export default function LessonBoard({
  watching,
  fn,
  index = 0,
  total = 1,
  onPrev,
  onNext,
  onReset,
  nextDisabled,
  code,
  highlightLine = 0,
  summarySteps,
  summaryOnly = false,
  data,
  changed,
  extraBar,
}: Props) {
  const lines = code.replace(/\n$/, "").split("\n");
  const showNav = total > 1 && onNext && onPrev && onReset;
  const summaryMode = summarySteps !== undefined && summarySteps.length > 0;

  if (summaryOnly && summaryMode) {
    return (
      <div className={styles.page}>
        <header className={`panel ${styles.bar}`}>
          <p className={styles.watching}>
            <strong>Summary. </strong>
            {watching}
          </p>
          {showNav ? (
            <div className={styles.nav}>
              <button type="button" className="btn" onClick={onReset}>
                Reset
              </button>
              <button
                type="button"
                className="btn"
                onClick={onPrev}
                disabled={index === 0}
              >
                Prev
              </button>
              <span className={styles.counter}>
                {index + 1} / {total}
              </span>
              <button
                type="button"
                className="btn primary"
                onClick={onNext}
                disabled={nextDisabled || index >= total - 1}
              >
                Next
              </button>
            </div>
          ) : null}
        </header>
        <section className={`panel ${styles.summaryOnly}`}>
          <ol className={styles.summaryListCentered}>
            {summarySteps.map((item, i) => (
              <li key={item.title}>
                <strong>
                  {i + 1}. {item.title}
                </strong>
                <span>{item.detail}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={`panel ${styles.bar}`}>
        <p className={styles.watching}>
          <strong>Now watching. </strong>
          {watching}
        </p>
        {showNav ? (
          <div className={styles.nav}>
            <button type="button" className="btn" onClick={onReset}>
              Reset
            </button>
            <button
              type="button"
              className="btn"
              onClick={onPrev}
              disabled={index === 0}
            >
              Prev
            </button>
            <span className={styles.counter}>
              {index + 1} / {total}
            </span>
            <button
              type="button"
              className="btn primary"
              onClick={onNext}
              disabled={nextDisabled || index >= total - 1}
            >
              Next
            </button>
          </div>
        ) : null}
      </header>
      {extraBar ? (
        <div className={`panel ${styles.extra}`}>{extraBar}</div>
      ) : null}
      <div className={styles.board}>
        <section className={`panel ${styles.col}`}>
          <p className={styles.label}>{summaryMode ? "Summary" : "Code"}</p>
          {summaryMode ? (
            <ol className={styles.summaryList}>
              {summarySteps.map((item, i) => (
                <li key={item.title}>
                  <strong>
                    {i + 1}. {item.title}
                  </strong>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ol>
          ) : (
            <>
              {fn ? <p className={styles.fn}>{fn}</p> : null}
              <pre className={styles.code}>
                <code>
                  {lines.map((line, i) => (
                    <span
                      key={`${i}-${line}`}
                      className={`${styles.line} ${i === highlightLine ? styles.lit : ""}`}
                    >
                      {line.length ? line : " "}
                    </span>
                  ))}
                </code>
              </pre>
            </>
          )}
        </section>
        <section className={`panel ${styles.col}`}>
          <p className={styles.label}>Data</p>
          {data ?? null}
        </section>
      </div>
      {changed ? (
        <p className={`panel ${styles.changed}`}>
          <span>What changed</span>
          {changed}
        </p>
      ) : null}
    </div>
  );
}
