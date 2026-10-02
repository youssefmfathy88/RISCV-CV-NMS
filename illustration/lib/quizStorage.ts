export const FLOW_SCORE_KEY = "nms-illustration-flow-score";
export const IOU_SCORE_KEY = "nms-illustration-iou-score";
export const SORT_SCORE_KEY = "nms-illustration-sort-score";

const SCORE_EVENT = "nms-score";

export function readScore(key: string): number {
  if (typeof window === "undefined") {
    return 0;
  }
  const raw = window.localStorage.getItem(key);
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) ? value : 0;
}

export function writeScore(key: string, value: number): void {
  if (typeof window === "undefined") {
    return;
  }
  const prev = readScore(key);
  window.localStorage.setItem(key, String(Math.max(prev, value)));
  window.dispatchEvent(new Event(SCORE_EVENT));
}

export function subscribeScores(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(SCORE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(SCORE_EVENT, onStoreChange);
  };
}

