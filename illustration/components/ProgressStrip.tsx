"use client";

import {
  FLOW_SCORE_KEY,
  IOU_SCORE_KEY,
  SORT_SCORE_KEY,
} from "@/lib/quizStorage";
import { useBestScore } from "@/lib/useBestScore";
import styles from "./ProgressStrip.module.css";

export default function ProgressStrip() {
  const [flow] = useBestScore(FLOW_SCORE_KEY);
  const [iou] = useBestScore(IOU_SCORE_KEY);
  const [sort] = useBestScore(SORT_SCORE_KEY);

  return (
    <div className={`panel ${styles.strip}`}>
      <span>Quiz progress (this browser)</span>
      <span className={flow ? styles.on : undefined}>Flow best {flow}</span>
      <span className={iou ? styles.on : undefined}>IoU {iou}/2</span>
      <span className={sort ? styles.on : undefined}>Sort {sort}/1</span>
    </div>
  );
}
