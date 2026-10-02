/** Scalar NMS helpers, ported from test/reference/source/NMS.cpp (ref::). */

export type Box = [number, number, number, number]; // y1, x1, y2, x2
export type SelectedRow = [number, number, number]; // batch, class, box_index

export function minNum(a: number, b: number): number {
  return a < b ? a : b;
}

export function maxNum(a: number, b: number): number {
  return a > b ? a : b;
}

export type IoUBreakdown = {
  aYmin: number;
  aXmin: number;
  aYmax: number;
  aXmax: number;
  bYmin: number;
  bXmin: number;
  bYmax: number;
  bXmax: number;
  overlapY: number;
  overlapX: number;
  intersection: number;
  areaA: number;
  areaB: number;
  union: number;
  iou: number;
  degenerate: boolean;
};

export function iouBreakdown(a: Box, b: Box): IoUBreakdown {
  const [aYmin, aXmin, aYmax, aXmax] = a;
  const [bYmin, bXmin, bYmax, bXmax] = b;
  const overlapY = maxNum(0, minNum(aYmax, bYmax) - maxNum(aYmin, bYmin));
  const overlapX = maxNum(0, minNum(aXmax, bXmax) - maxNum(aXmin, bXmin));
  const intersection = overlapY * overlapX;
  const areaA = (aYmax - aYmin) * (aXmax - aXmin);
  const areaB = (bYmax - bYmin) * (bXmax - bXmin);

  if (areaA <= 0 || areaB <= 0) {
    return {
      aYmin,
      aXmin,
      aYmax,
      aXmax,
      bYmin,
      bXmin,
      bYmax,
      bXmax,
      overlapY,
      overlapX,
      intersection,
      areaA,
      areaB,
      union: 0,
      iou: 0,
      degenerate: true,
    };
  }

  const union = areaA + areaB - intersection;
  if (union <= 0) {
    return {
      aYmin,
      aXmin,
      aYmax,
      aXmax,
      bYmin,
      bXmin,
      bYmax,
      bXmax,
      overlapY,
      overlapX,
      intersection,
      areaA,
      areaB,
      union,
      iou: 0,
      degenerate: true,
    };
  }

  return {
    aYmin,
    aXmin,
    aYmax,
    aXmax,
    bYmin,
    bXmin,
    bYmax,
    bXmax,
    overlapY,
    overlapX,
    intersection,
    areaA,
    areaB,
    union,
    iou: intersection / union,
    degenerate: false,
  };
}

export function iou(a: Box, b: Box): number {
  return iouBreakdown(a, b).iou;
}

export type ScoreFilterResult = {
  order: number[];
  packedScores: number[];
};

export function applyScoreSuppression(
  classScores: number[],
  scoreThreshold: number | null,
): ScoreFilterResult {
  const order: number[] = [];
  const packedScores: number[] = [];
  for (let boxIndex = 0; boxIndex < classScores.length; boxIndex++) {
    if (scoreThreshold !== null && classScores[boxIndex] < scoreThreshold) {
      continue;
    }
    packedScores.push(classScores[boxIndex]);
    order.push(boxIndex);
  }
  return { order, packedScores };
}

/** Copy classScores[order[i]] — used by sort labs that start from an explicit order. */
export function packCandidateScores(
  classScores: number[],
  order: number[],
): number[] {
  const packed: number[] = [];
  for (let i = 0; i < order.length; i++) {
    packed.push(classScores[order[i]]);
  }
  return packed;
}

export type SwapPair = {
  leftIndex: number;
  rightIndex: number;
  leftScore: number;
  rightScore: number;
  leftBox: number;
  rightBox: number;
  swapped: boolean;
};

export function unpairedIndices(count: number, start: number): number[] {
  const paired = new Set<number>();
  const pairCount = Math.floor((count - start) / 2);
  for (let pair = 0; pair < pairCount; pair++) {
    const i = start + 2 * pair;
    paired.add(i);
    paired.add(i + 1);
  }
  const leftover: number[] = [];
  for (let i = 0; i < count; i++) {
    if (!paired.has(i)) {
      leftover.push(i);
    }
  }
  return leftover;
}

/** One odd-even phase. Mutates packedScores and order. Swap iff left_score < right_score. */
export function compareSwapPairs(
  packedScores: number[],
  order: number[],
  start: number,
): SwapPair[] {
  const candidateCount = packedScores.length;
  const pairCount = Math.floor((candidateCount - start) / 2);
  const pairs: SwapPair[] = [];
  for (let pair = 0; pair < pairCount; pair++) {
    const i = start + 2 * pair;
    const leftScore = packedScores[i];
    const rightScore = packedScores[i + 1];
    const leftBox = order[i];
    const rightBox = order[i + 1];
    const swapped = leftScore < rightScore;
    pairs.push({
      leftIndex: i,
      rightIndex: i + 1,
      leftScore,
      rightScore,
      leftBox,
      rightBox,
      swapped,
    });
    if (swapped) {
      packedScores[i] = rightScore;
      packedScores[i + 1] = leftScore;
      order[i] = rightBox;
      order[i + 1] = leftBox;
    }
  }
  return pairs;
}

export type SortPhase = {
  phase: number;
  start: number;
  label: "even" | "odd";
  pairs: SwapPair[];
  leftover: number[];
  order: number[];
  packedScores: number[];
};

/** True iff no adjacent pair would swap (left_score strictly less than right_score). */
export function isSortedDescending(values: number[]): boolean {
  for (let i = 0; i < values.length - 1; i++) {
    if (values[i] < values[i + 1]) {
      return false;
    }
  }
  return true;
}

export function sortCandidatesByScore(
  order: number[],
  packedScores: number[],
): { packedScores: number[]; phases: SortPhase[] } {
  const scores = [...packedScores];
  if (order.length <= 1) {
    return {
      packedScores: scores,
      phases: [],
    };
  }

  const phases: SortPhase[] = [];
  for (let phase = 0; phase < order.length; phase++) {
    const start = phase & 1;
    const pairs = compareSwapPairs(scores, order, start);
    phases.push({
      phase,
      start,
      label: start === 0 ? "even" : "odd",
      pairs,
      leftover: unpairedIndices(order.length, start),
      order: [...order],
      packedScores: [...scores],
    });
  }
  return { packedScores: scores, phases };
}

export type NmsInput = {
  boxes: Box[];
  scores: number[][];
  maxOutputBoxesPerClass: number;
  iouThreshold: number;
  scoreThreshold: number | null;
};

export function nonMaxSuppression(input: NmsInput): SelectedRow[] {
  const { boxes, scores, iouThreshold, scoreThreshold } = input;
  const numBoxes = boxes.length;
  const numClasses = scores.length;
  if (
    numBoxes === 0 ||
    numClasses === 0 ||
    input.maxOutputBoxesPerClass <= 0
  ) {
    return [];
  }

  const maxPerClass = Math.min(input.maxOutputBoxesPerClass, numBoxes);
  const selected: SelectedRow[] = [];

  for (let cls = 0; cls < numClasses; cls++) {
    const { order, packedScores } = applyScoreSuppression(
      scores[cls],
      scoreThreshold,
    );
    sortCandidatesByScore(order, packedScores);

    const suppressed = order.map(() => 0);
    let selectedForClass = 0;
    for (
      let i = 0;
      i < order.length && selectedForClass < maxPerClass;
      i++
    ) {
      if (suppressed[i] !== 0) {
        continue;
      }

      const index = order[i];
      selected.push([0, cls, index]);
      selectedForClass += 1;

      const kept = boxes[index];
      for (let j = i + 1; j < order.length; j++) {
        if (
          suppressed[j] === 0 &&
          iou(kept, boxes[order[j]]) > iouThreshold
        ) {
          suppressed[j] = 1;
        }
      }
    }
  }

  return selected;
}

export function selectedEquals(a: SelectedRow[], b: SelectedRow[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every(
    (row, i) =>
      row[0] === b[i][0] && row[1] === b[i][1] && row[2] === b[i][2],
  );
}
