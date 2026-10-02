"use client";

import { applyTheme } from "@/lib/theme";
import styles from "./ThemeToggle.module.css";

export default function ThemeToggle() {
  return (
    <div className={styles.wrap} role="group" aria-label="Color theme">
      <button
        type="button"
        className={`${styles.opt} ${styles.dark}`}
        onClick={() => applyTheme("dark")}
      >
        Dark
      </button>
      <button
        type="button"
        className={`${styles.opt} ${styles.sepia}`}
        onClick={() => applyTheme("sepia")}
      >
        Sepia
      </button>
    </div>
  );
}
