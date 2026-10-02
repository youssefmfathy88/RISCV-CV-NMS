import {
  applyScoreSuppression,
  isSortedDescending,
  nonMaxSuppression,
  selectedEquals,
  type Box,
  type SelectedRow,
} from "./nms";
import { buildTrace, isIouCompareExtra } from "./trace";

export type SceneObject = {
  kind: "person" | "vehicle" | "blob";
  classId: number;
  box: Box;
  label: string;
};

export type Scene = {
  id: string;
  name: string;
  description: string;
  classNames: string[];
  objects: SceneObject[];
  boxes: Box[];
  scores: number[][];
  maxOutputBoxesPerClass: number;
  iouThreshold: number;
  scoreThreshold: number;
  expected: SelectedRow[];
};

export const WALKTHROUGH: Scene = {
  id: "walkthrough",
  name: "Walkthrough (6 boxes, 1 class)",
  description:
    "Six detections, two clusters of three, one class. Box 2 is the largest and sits mid-array; class 0 drops it on score (0.2) so compress must close a mid-array gap, not a trailing skip. Survivors are packed in discovery order with scores rising toward later boxes, so odd-even sort has to swap.",
  classNames: ["person"],
  objects: [
    {
      kind: "person",
      classId: 0,
      box: [0.4, 0.5, 3.6, 3.4],
      label: "cluster A",
    },
    {
      kind: "person",
      classId: 0,
      box: [20.4, 20.4, 23.6, 24.5],
      label: "cluster B",
    },
  ],
  boxes: [
    [0, 0, 4, 4],
    [0, 0, 4, 3],
    [0, 0, 5, 5],
    [20, 20, 24, 24],
    [20, 21, 24, 25],
    [20, 20.5, 24, 24.5],
  ],
  scores: [[0.45, 0.55, 0.2, 0.7, 0.8, 0.9]],
  maxOutputBoxesPerClass: 2,
  iouThreshold: 0.5,
  scoreThreshold: 0.4,
  expected: [
    [0, 0, 5],
    [0, 0, 1],
  ],
};

const ONNX_BOXES: Box[] = [
  [0.0, 0.0, 1.0, 1.0],
  [0.0, 0.1, 1.0, 1.1],
  [0.0, -0.1, 1.0, 0.9],
  [0.0, 10.0, 1.0, 11.0],
  [0.0, 10.1, 1.0, 11.1],
  [0.0, 100.0, 1.0, 101.0],
];

const ONNX_SCORES = [0.9, 0.75, 0.6, 0.95, 0.5, 0.3];

export const ONNX_TWO_CLASSES: Scene = {
  id: "onnx-two-classes",
  name: "ONNX two_classes (6 boxes)",
  description:
    "Golden ONNX case: three clusters on a line (near x=0, x=10, x=100). Both classes share the same scores. max_per_class = 2.",
  classNames: ["class 0", "class 1"],
  objects: [
    { kind: "blob", classId: 0, box: [0.15, 0.15, 0.85, 0.85], label: "cluster A" },
    { kind: "blob", classId: 0, box: [0.15, 10.15, 0.85, 10.85], label: "cluster B" },
    { kind: "blob", classId: 0, box: [0.15, 100.15, 0.85, 100.85], label: "cluster C" },
  ],
  boxes: ONNX_BOXES,
  scores: [ONNX_SCORES, ONNX_SCORES],
  maxOutputBoxesPerClass: 2,
  iouThreshold: 0.5,
  scoreThreshold: 0.0,
  expected: [
    [0, 0, 3],
    [0, 0, 0],
    [0, 1, 3],
    [0, 1, 0],
  ],
};

export const SCENES: Scene[] = [WALKTHROUGH, ONNX_TWO_CLASSES];

export function sceneById(id: string): Scene {
  return SCENES.find((scene) => scene.id === id) ?? WALKTHROUGH;
}

export function verifyScenes(): string[] {
  const errors: string[] = [];
  for (const scene of SCENES) {
    const got = nonMaxSuppression({
      boxes: scene.boxes,
      scores: scene.scores,
      maxOutputBoxesPerClass: scene.maxOutputBoxesPerClass,
      iouThreshold: scene.iouThreshold,
      scoreThreshold: scene.scoreThreshold,
    });
    if (!selectedEquals(got, scene.expected)) {
      errors.push(
        `${scene.id}: expected ${JSON.stringify(scene.expected)}, got ${JSON.stringify(got)}`,
      );
    }
    if (scene.id === "walkthrough") {
      const { packedScores } = applyScoreSuppression(
        scene.scores[0],
        scene.scoreThreshold,
      );
      if (packedScores.length <= 1) {
        errors.push("walkthrough should keep enough candidates to sort");
      } else if (isSortedDescending(packedScores)) {
        errors.push(
          "walkthrough packed scores are already descending; sort will not swap",
        );
      }
      const greedySeq = buildTrace({
        boxes: scene.boxes,
        scores: scene.scores,
        maxOutputBoxesPerClass: scene.maxOutputBoxesPerClass,
        iouThreshold: scene.iouThreshold,
        scoreThreshold: scene.scoreThreshold,
        classNames: scene.classNames,
      })
        .filter(
          (step) =>
            step.snapshot.cls === 0 &&
            (step.kind === "keep" ||
              step.kind === "iou-compare" ||
              step.kind === "consider-skip"),
        )
        .map((step) => {
          if (step.kind === "keep") {
            return `keep:${step.snapshot.keptBox}`;
          }
          if (step.kind === "consider-skip") {
            return `skip:${step.snapshot.currentBox}`;
          }
          if (isIouCompareExtra(step.extra)) {
            return `iou:${step.extra.kept}-${step.extra.other}`;
          }
          return step.kind;
        });
      const expectedGreedy = [
        "keep:5",
        "iou:5-4",
        "iou:5-3",
        "iou:5-1",
        "iou:5-0",
        "skip:4",
        "skip:3",
        "keep:1",
        "iou:1-0",
      ];
      if (greedySeq.join(",") !== expectedGreedy.join(",")) {
        errors.push(
          `walkthrough greedy sequence ${JSON.stringify(greedySeq)} != ${JSON.stringify(expectedGreedy)}`,
        );
      }
    }
  }
  return errors;
}

const SCENE_ERRORS = verifyScenes();
if (SCENE_ERRORS.length > 0) {
  console.error("NMS scene mismatch", SCENE_ERRORS);
}
