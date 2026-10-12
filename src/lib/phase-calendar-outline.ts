type Corner = { c: number; r: number };
type Segment = { from: Corner; to: Corner };

function inPhaseRange(
  key: string,
  phaseStart: string,
  phaseEnd: string,
  objectiveStart: string,
  objectiveEnd: string,
): boolean {
  return (
    key >= phaseStart &&
    key <= phaseEnd &&
    key >= objectiveStart &&
    key <= objectiveEnd
  );
}

function cornerEq(a: Corner, b: Corner): boolean {
  return a.c === b.c && a.r === b.r;
}

function collectPhaseIndices(
  cellKeys: string[],
  phaseStart: string,
  phaseEnd: string,
  objectiveStart: string,
  objectiveEnd: string,
): number[] {
  const indices: number[] = [];
  cellKeys.forEach((key, index) => {
    if (inPhaseRange(key, phaseStart, phaseEnd, objectiveStart, objectiveEnd)) {
      indices.push(index);
    }
  });
  return indices;
}

function boundarySegmentsForIndex(
  index: number,
  cellKeys: string[],
  inPhase: (idx: number) => boolean,
): Segment[] {
  const col = index % 7;
  const row = Math.floor(index / 7);
  const has = (idx: number) => idx >= 0 && idx < cellKeys.length && inPhase(idx);

  const top = index < 7 || !has(index - 7);
  const bottom = index + 7 >= cellKeys.length || !has(index + 7);
  const left = index % 7 === 0 || !has(index - 1);
  const right = index % 7 === 6 || !has(index + 1);

  const segs: Segment[] = [];
  if (top) segs.push({ from: { c: col, r: row }, to: { c: col + 1, r: row } });
  if (right) segs.push({ from: { c: col + 1, r: row }, to: { c: col + 1, r: row + 1 } });
  if (bottom) segs.push({ from: { c: col + 1, r: row + 1 }, to: { c: col, r: row + 1 } });
  if (left) segs.push({ from: { c: col, r: row + 1 }, to: { c: col, r: row } });
  return segs;
}

function chainBoundarySegments(segments: Segment[]): Corner[][] {
  const unused = [...segments];
  const loops: Corner[][] = [];

  while (unused.length > 0) {
    const first = unused.shift()!;
    const loop: Corner[] = [first.from, first.to];

    let extended = true;
    while (extended && unused.length > 0) {
      extended = false;
      const tail = loop[loop.length - 1]!;
      const head = loop[0]!;
      let idx = unused.findIndex((s) => cornerEq(s.from, tail));
      if (idx >= 0) {
        loop.push(unused[idx]!.to);
        unused.splice(idx, 1);
        extended = true;
        continue;
      }
      idx = unused.findIndex((s) => cornerEq(s.to, head));
      if (idx >= 0) {
        loop.unshift(unused[idx]!.from);
        unused.splice(idx, 1);
        extended = true;
      }
    }
    loops.push(loop);
  }
  return loops;
}

/** One closed corner loop per connected phase region on the grid (week-wrap splits). */
export function tracePhaseOutlineLoops(
  cellKeys: string[],
  phaseStart: string | null | undefined,
  phaseEnd: string | null | undefined,
  objectiveStart: string,
  objectiveEnd: string,
): Corner[][] {
  if (!phaseStart || !phaseEnd) return [];

  const indices = collectPhaseIndices(
    cellKeys,
    phaseStart,
    phaseEnd,
    objectiveStart,
    objectiveEnd,
  );
  if (indices.length === 0) return [];

  const inPhase = (idx: number) =>
    inPhaseRange(
      cellKeys[idx]!,
      phaseStart,
      phaseEnd,
      objectiveStart,
      objectiveEnd,
    );

  const segments: Segment[] = [];
  for (const index of indices) {
    segments.push(...boundarySegmentsForIndex(index, cellKeys, inPhase));
  }
  if (segments.length === 0) return [];

  return chainBoundarySegments(segments);
}

export type PhaseGridLayout = {
  originX: number;
  originY: number;
  stepX: number;
  stepY: number;
  halfGapX: number;
  halfGapY: number;
};

export function cornerToLocal(
  corner: Corner,
  layout: PhaseGridLayout,
): { x: number; y: number } {
  return {
    x: layout.originX + corner.c * layout.stepX - layout.halfGapX,
    y: layout.originY + corner.r * layout.stepY - layout.halfGapY,
  };
}

function pointEq(
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Keep only orthogonal turn vertices (drops collinear points along straight edges). */
export function simplifyOrthogonalOutline(
  points: { x: number; y: number }[],
): { x: number; y: number }[] {
  if (points.length < 3) return points;

  const deduped: { x: number; y: number }[] = [];
  for (const p of points) {
    const last = deduped[deduped.length - 1];
    if (last && pointEq(last, p)) continue;
    deduped.push(p);
  }
  if (deduped.length > 1 && pointEq(deduped[0]!, deduped[deduped.length - 1]!)) {
    deduped.pop();
  }

  let ring = deduped;
  for (let pass = 0; pass < ring.length; pass++) {
    const n = ring.length;
    if (n < 3) break;
    const simplified: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const prev = ring[(i - 1 + n) % n]!;
      const curr = ring[i]!;
      const next = ring[(i + 1) % n]!;
      const collinear =
        (prev.x === curr.x && curr.x === next.x) ||
        (prev.y === curr.y && curr.y === next.y);
      if (!collinear) simplified.push(curr);
    }
    if (simplified.length === ring.length || simplified.length < 3) break;
    ring = simplified;
  }
  return ring;
}

function polygonSignedArea(points: { x: number; y: number }[]): number {
  let sum = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % n]!;
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

/** Closed SVG path with rounded convex corners (reflex corners stay sharp). */
export function roundedOutlinePath(
  points: { x: number; y: number }[],
  radius: number,
): string {
  const ring = simplifyOrthogonalOutline(points);
  const n = ring.length;
  if (n < 3) return "";

  const ccw = polygonSignedArea(ring) > 0;
  const clamp = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v));

  let d = "";
  let startP1: { x: number; y: number } | null = null;

  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n]!;
    const curr = ring[i]!;
    const next = ring[(i + 1) % n]!;

    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const len1 = Math.hypot(v1x, v1y) || 1;
    const len2 = Math.hypot(v2x, v2y) || 1;
    const cross = v1x * v2y - v1y * v2x;
    const convex = ccw ? cross > 0 : cross < 0;

    const r = convex
      ? clamp(radius, 0, Math.min(len1, len2) / 2 - 0.01)
      : 0;
    const p1 = {
      x: curr.x - (v1x / len1) * r,
      y: curr.y - (v1y / len1) * r,
    };
    const p2 = {
      x: curr.x + (v2x / len2) * r,
      y: curr.y + (v2y / len2) * r,
    };

    if (i === 0) {
      startP1 = p1;
      d += `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
    } else {
      d += ` L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
    }

    if (convex && r > 0.01) {
      const sweep = ccw ? 1 : 0;
      d += ` A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 ${sweep} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    } else {
      d += ` L ${curr.x.toFixed(2)} ${curr.y.toFixed(2)} L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
  }

  if (startP1) {
    d += ` L ${startP1.x.toFixed(2)} ${startP1.y.toFixed(2)}`;
  }
  return `${d} Z`;
}

export function measurePhaseGridLayout(
  gridEl: HTMLElement,
): PhaseGridLayout | null {
  const dayCells = gridEl.querySelectorAll<HTMLElement>("[data-calendar-day]");
  if (dayCells.length === 0) return null;

  const gridRect = gridEl.getBoundingClientRect();
  const cell0 = dayCells[0]!.getBoundingClientRect();
  const cell1 = dayCells[1]?.getBoundingClientRect();
  const cell7 = dayCells[7]?.getBoundingClientRect();

  const originX = cell0.left - gridRect.left;
  const originY = cell0.top - gridRect.top;
  const cw = cell0.width;
  const ch = cell0.height;
  const stepX = cell1 ? cell1.left - cell0.left : cw + 6;
  const stepY = cell7 ? cell7.top - cell0.top : ch + 6;
  const halfGapX = Math.max(0, (stepX - cw) / 2);
  const halfGapY = Math.max(0, (stepY - ch) / 2);

  return { originX, originY, stepX, stepY, halfGapX, halfGapY };
}

export function buildPhaseOutlinePathD(
  cellKeys: string[],
  phaseStart: string | null | undefined,
  phaseEnd: string | null | undefined,
  objectiveStart: string,
  objectiveEnd: string,
  layout: PhaseGridLayout,
  cornerRadius: number,
): string {
  const loops = tracePhaseOutlineLoops(
    cellKeys,
    phaseStart,
    phaseEnd,
    objectiveStart,
    objectiveEnd,
  );

  const pathParts: string[] = [];
  for (const corners of loops) {
    if (corners.length < 3) continue;
    const points = corners.map((c) => cornerToLocal(c, layout));
    const d = roundedOutlinePath(points, cornerRadius);
    if (d) pathParts.push(d);
  }
  return pathParts.join(" ");
}

