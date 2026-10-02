export function fmtNum(value: number, digits = 4): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  const rounded = Number(value.toFixed(digits));
  if (Number.isInteger(rounded)) {
    return rounded.toFixed(1);
  }
  return String(rounded);
}

export function fmtScore(value: number): string {
  return value.toFixed(2);
}

export function fmtIou(value: number): string {
  if (value === 0) {
    return "0";
  }
  return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}
