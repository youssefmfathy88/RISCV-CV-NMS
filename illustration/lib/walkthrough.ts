export type StageId = "inputs" | "score" | "sort" | "greedy";
export type LessonMode = "brief" | "scalar" | "vector";
export type VectorPart = "packing" | "greedy";
export type TeachingVlmax = 2 | 4 | 8;

export const STAGES: { id: StageId; label: string }[] = [
  { id: "inputs", label: "1. Inputs" },
  { id: "score", label: "2. Score filter" },
  { id: "sort", label: "3. Sort" },
  { id: "greedy", label: "4. Greedy IoU" },
];

export const TEACHING_VLMAX: TeachingVlmax[] = [2, 4, 8];

export function setTeachingVl(remaining: number, vlmax: TeachingVlmax): number {
  return Math.min(remaining, vlmax);
}
