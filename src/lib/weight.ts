const EPS = 0.01;

/** One decimal place — matches syllabus / dashboard weight granularity. */
export function roundWeightTenth(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

/** Human-readable weight (avoids float noise like 1.7999999999999998). */
export function formatWeightDisplay(value: number): string {
  const r = roundWeightTenth(value);
  if (Number.isInteger(r)) return String(r);
  return r.toFixed(1);
}

export function weightsEqual(a: number, b: number) {
  return Math.abs(a - b) < EPS;
}

/** Split `total` across `count` rows (1 decimal); sum matches `total`. */
export function spreadWeightsEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  if (total <= 0) return Array.from({ length: count }, () => 0);

  const scale = 10;
  const totalTicks = Math.round(roundWeightTenth(total) * scale);
  const baseTicks = Math.floor(totalTicks / count);
  let remainder = totalTicks - baseTicks * count;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    let ticks = baseTicks;
    if (remainder > 0) {
      ticks += 1;
      remainder -= 1;
    }
    out.push(ticks / scale);
  }
  return out;
}

export function assertWeightsSumTo(target: number, parts: number[], label = "Subtopic weights") {
  const sum = parts.reduce((s, w) => s + w, 0);
  if (sum > target + EPS) {
    throw new Error(`${label} cannot exceed ${target} (got ${sum.toFixed(2)}).`);
  }
  if (!weightsEqual(sum, target)) {
    throw new Error(
      `${label} must sum to exactly ${target} (currently ${sum.toFixed(2)}).`,
    );
  }
}
