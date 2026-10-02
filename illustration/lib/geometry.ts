import type { Box } from "./nms";

export type WorldView = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

export function boxRect(box: Box): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const [y1, x1, y2, x2] = box;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Inset a box so coincident edges draw as parallel lines, not one stroke. */
export function displayRect(
  box: Box,
  slot: number,
): { x: number; y: number; width: number; height: number } {
  const r = boxRect(box);
  const inset = 0.08 + slot * 0.14;
  return {
    x: r.x + inset,
    y: r.y + inset,
    width: Math.max(0.12, r.width - 2 * inset),
    height: Math.max(0.12, r.height - 2 * inset),
  };
}

export function worldViewForBoxes(boxes: Box[], padRatio = 0.12): WorldView {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [y1, x1, y2, x2] of boxes) {
    minX = Math.min(minX, x1);
    minY = Math.min(minY, y1);
    maxX = Math.max(maxX, x2);
    maxY = Math.max(maxY, y2);
  }
  if (!Number.isFinite(minX)) {
    return { minX: -1, minY: -1, width: 10, height: 10 };
  }
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const pad = Math.max(spanX, spanY) * padRatio;
  return {
    minX: minX - pad,
    minY: minY - pad,
    width: spanX + 2 * pad,
    height: spanY + 2 * pad,
  };
}

/** Frame a cluster tightly enough to read, with a little margin for labels. */
export function worldViewForCluster(
  boxes: Box[],
  padRatio = 0.22,
  minSpan = 6.5,
): WorldView {
  const base = worldViewForBoxes(boxes, padRatio);
  const width = Math.max(base.width, minSpan);
  const height = Math.max(base.height, minSpan);
  const labelBand = height * 0.36;
  return {
    minX: base.minX - (width - base.width) / 2,
    minY: base.minY - (height - base.height) / 2 - labelBand,
    width,
    height: height + labelBand,
  };
}

export function viewBoxAttr(view: WorldView): string {
  return `${view.minX} ${view.minY} ${view.width} ${view.height}`;
}

export function intersectionRect(
  a: Box,
  b: Box,
): { x: number; y: number; width: number; height: number } | null {
  const y1 = Math.max(a[0], b[0]);
  const x1 = Math.max(a[1], b[1]);
  const y2 = Math.min(a[2], b[2]);
  const x2 = Math.min(a[3], b[3]);
  if (y2 <= y1 || x2 <= x1) {
    return null;
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function normalizeBox(box: Box): Box {
  const y1 = Math.min(box[0], box[2]);
  const y2 = Math.max(box[0], box[2]);
  const x1 = Math.min(box[1], box[3]);
  const x2 = Math.max(box[1], box[3]);
  return [y1, x1, y2, x2];
}
