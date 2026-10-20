/** YYYY-MM-DD */
export type DateString = string;

/** Phases may be a single day (inclusive). */
export const MIN_PHASE_DAYS = 1;
/** Inclusive. Study cycles must span at least one week. */
export const MIN_OBJECTIVE_DAYS = 7;

function dateStringToUtcMs(s: DateString): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Inclusive day count; no date-fns so client bundles stay stable. */
export function inclusiveDayCount(start: DateString, end: DateString): number {
  if (start > end) return 0;
  const dayMs = 86_400_000;
  let count = 0;
  for (let t = dateStringToUtcMs(start); t <= dateStringToUtcMs(end); t += dayMs) {
    count += 1;
  }
  return count;
}
