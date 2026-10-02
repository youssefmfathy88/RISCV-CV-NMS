"use client";

import { readScore, subscribeScores, writeScore } from "@/lib/quizStorage";
import { useCallback, useSyncExternalStore } from "react";

export function useBestScore(key: string): [number, (value: number) => void] {
  const score = useSyncExternalStore(
    subscribeScores,
    () => readScore(key),
    () => 0,
  );
  const setScore = useCallback(
    (value: number) => {
      writeScore(key, value);
    },
    [key],
  );
  return [score, setScore];
}
