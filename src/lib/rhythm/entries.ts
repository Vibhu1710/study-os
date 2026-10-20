import type { RhythmSandglassConfig } from "@/lib/rhythm/effective-minutes";
import {
  formatRhythmDuration,
  rhythmEffectiveMinutes,
  type RhythmSessionInput,
} from "@/lib/rhythm/effective-minutes";

/** Partial slider skips 10% and 90% (tenths 1 and 9). */
export const PARTIAL_SLIDER_MIN_TENTHS = 2;
export const PARTIAL_SLIDER_MAX_TENTHS = 9 - 1;

export function clampPartialSliderTenth(n: number): number {
  return Math.min(
    PARTIAL_SLIDER_MAX_TENTHS,
    Math.max(PARTIAL_SLIDER_MIN_TENTHS, Math.round(n)),
  );
}

export type RhythmFlipEntry = {
  id: string;
  kind: "complete" | "partial";
  /** Start partial: tenths left in upper bulb (1–9). */
  remainingTenths?: number;
  /** End partial: tenths accumulated in lower bulb (1–9). */
  lowerTenths?: number;
};

function clampTenth(n: number): number {
  return Math.min(9, Math.max(1, Math.round(n)));
}

/** Start partial at index 0 with upper remaining only. */
export function isStartPartialEntry(
  entry: RhythmFlipEntry,
  index: number,
): boolean {
  return (
    entry.kind === "partial" &&
    index === 0 &&
    entry.remainingTenths != null &&
    entry.lowerTenths == null
  );
}

/** End partial at last index (lower tenths, or legacy upper remaining). */
export function isEndPartialEntry(
  entry: RhythmFlipEntry,
  index: number,
  entries: RhythmFlipEntry[],
): boolean {
  if (entry.kind !== "partial") return false;
  if (index !== entries.length - 1) return false;
  if (index === 0 && entry.remainingTenths != null && entry.lowerTenths == null) {
    return false;
  }
  return entry.lowerTenths != null || entry.remainingTenths != null;
}

export function startPartialUpperTenths(entry: RhythmFlipEntry): number {
  return clampTenth(entry.remainingTenths ?? 1);
}

/** Lower tenths for end partial; legacy rows may only have upper remaining. */
export function endPartialLowerTenths(entry: RhythmFlipEntry): number {
  if (entry.lowerTenths != null) return clampTenth(entry.lowerTenths);
  if (entry.remainingTenths != null) {
    return clampTenth(10 - entry.remainingTenths);
  }
  return 1;
}

export type RhythmDayState = {
  startTime: string;
  endTime: string;
  startTimeConfirmed: boolean;
  endTimeConfirmed: boolean;
  startsWithOddCycle: boolean;
  continuedFromPreviousDay: boolean;
  entries: RhythmFlipEntry[];
};

function minutesForSlot(isOdd: boolean, cfg: RhythmSandglassConfig): number {
  return isOdd ? cfg.oddMinutes : cfg.evenMinutes;
}

export function newEntryId(): string {
  return crypto.randomUUID();
}

export function parityAtIndex(
  startsWithOdd: boolean,
  entries: RhythmFlipEntry[],
  index: number,
): boolean {
  let isOdd = startsWithOdd;
  for (let i = 0; i < index; i++) {
    isOdd = advanceParityAfterEntry(isOdd, entries[i], i, entries);
  }
  return isOdd;
}

/** Parity label for entry at index (after consuming prior entries). */
export function entryParityIsOdd(
  startsWithOdd: boolean,
  entries: RhythmFlipEntry[],
  index: number,
): boolean {
  let isOdd = startsWithOdd;
  for (let i = 0; i < index; i++) {
    isOdd = advanceParityAfterEntry(isOdd, entries[i], i, entries);
  }
  return isOdd;
}

function advanceParityAfterEntry(
  isOdd: boolean,
  e: RhythmFlipEntry,
  index: number,
  entries: RhythmFlipEntry[],
): boolean {
  if (e.kind === "complete") return !isOdd;
  if (isStartPartialEntry(e, index)) return !isOdd;
  if (isEndPartialEntry(e, index, entries)) return isOdd;
  return isOdd;
}

export function rhythmEffectiveFromEntries(
  startsWithOdd: boolean,
  entries: RhythmFlipEntry[],
  cfg: RhythmSandglassConfig,
): number {
  let total = 0;
  let isOdd = startsWithOdd;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.kind === "complete") {
      total += minutesForSlot(isOdd, cfg);
      isOdd = !isOdd;
    } else if (isStartPartialEntry(e, i)) {
      const upper = startPartialUpperTenths(e);
      total += minutesForSlot(isOdd, cfg) * (upper / 10);
      isOdd = !isOdd;
    } else if (isEndPartialEntry(e, i, entries)) {
      const lower = endPartialLowerTenths(e);
      total += minutesForSlot(isOdd, cfg) * (lower / 10);
    }
  }
  return Math.round(total * 10) / 10;
}

export type RhythmStudyMinutesBreakdown = {
  startPartialMinutes: number;
  completeMinutes: number;
  endPartialMinutes: number;
};

export function rhythmStudyMinutesBreakdown(
  startsWithOdd: boolean,
  entries: RhythmFlipEntry[],
  cfg: RhythmSandglassConfig,
): RhythmStudyMinutesBreakdown {
  let isOdd = startsWithOdd;
  let startPartialMinutes = 0;
  let completeMinutes = 0;
  let endPartialMinutes = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.kind === "complete") {
      completeMinutes += minutesForSlot(isOdd, cfg);
      isOdd = !isOdd;
    } else if (isStartPartialEntry(e, i)) {
      const upper = startPartialUpperTenths(e);
      startPartialMinutes += minutesForSlot(isOdd, cfg) * (upper / 10);
      isOdd = !isOdd;
    } else if (isEndPartialEntry(e, i, entries)) {
      const lower = endPartialLowerTenths(e);
      endPartialMinutes += minutesForSlot(isOdd, cfg) * (lower / 10);
    }
  }
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    startPartialMinutes: round(startPartialMinutes),
    completeMinutes: round(completeMinutes),
    endPartialMinutes: round(endPartialMinutes),
  };
}

/** Cycle pool total (complete = 1, partial = fraction moved). */
export function rhythmCyclePoolTotal(entries: RhythmFlipEntry[]): number {
  let total = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.kind === "complete") total += 1;
    else if (isStartPartialEntry(e, i)) {
      total += startPartialUpperTenths(e) / 10;
    } else if (isEndPartialEntry(e, i, entries)) {
      total += endPartialLowerTenths(e) / 10;
    }
  }
  return Math.round(total * 100) / 100;
}

export function formatSandCycleTotal(value: number): string {
  if (value <= 0) return "0";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function startPartialLogLabel(upperTenths: number, minutes: number): string {
  const pct = clampTenth(upperTenths) * 10;
  return `${pct}% upper · ${formatRhythmDuration(minutes)}`;
}

export function fullCyclesLogLabel(completeCount: number, minutes: number): string {
  return `${completeCount} · ${formatRhythmDuration(minutes)}`;
}

export function endPartialLogLabel(lowerTenths: number, minutes: number): string {
  const pct = clampTenth(lowerTenths) * 10;
  return `${pct}% lower · ${formatRhythmDuration(minutes)}`;
}

/** Fold entries → legacy session fields for storage compatibility. */
export function foldEntriesToLegacy(
  startsWithOdd: boolean,
  entries: RhythmFlipEntry[],
): Pick<
  RhythmSessionInput,
  "startsWithOddCycle" | "fullCycleCount" | "startPartialTenths" | "endPartialTenths"
> {
  if (entries.length === 0) {
    return {
      startsWithOddCycle: startsWithOdd,
      fullCycleCount: 0,
      startPartialTenths: 0,
      endPartialTenths: 0,
    };
  }
  let startPartialTenths = 0;
  let idx = 0;
  const first = entries[0];
  if (isStartPartialEntry(first, 0)) {
    startPartialTenths = first.remainingTenths ?? 0;
    idx = 1;
  }
  let fullCycleCount = 0;
  let endPartialTenths = 0;
  for (; idx < entries.length; idx++) {
    const e = entries[idx];
    if (isEndPartialEntry(e, idx, entries)) {
      endPartialTenths = endPartialLowerTenths(e);
      break;
    }
    if (e.kind === "complete") fullCycleCount++;
    else break;
  }
  return {
    startsWithOddCycle: startsWithOdd,
    fullCycleCount,
    startPartialTenths,
    endPartialTenths,
  };
}

/** Expand legacy row → entries (for old rows without JSON). */
export function expandLegacyToEntries(
  session: RhythmSessionInput,
): RhythmFlipEntry[] {
  const out: RhythmFlipEntry[] = [];
  if (session.startPartialTenths > 0) {
    out.push({
      id: newEntryId(),
      kind: "partial",
      remainingTenths: session.startPartialTenths,
    });
  }
  for (let i = 0; i < session.fullCycleCount; i++) {
    out.push({ id: newEntryId(), kind: "complete" });
  }
  if (session.endPartialTenths > 0) {
    out.push({
      id: newEntryId(),
      kind: "partial",
      lowerTenths: session.endPartialTenths,
    });
  }
  return out;
}

export function effectiveMinutesForDay(
  day: RhythmDayState,
  cfg: RhythmSandglassConfig,
): number {
  if (day.entries.length > 0) {
    return rhythmEffectiveFromEntries(day.startsWithOddCycle, day.entries, cfg);
  }
  const legacy = foldEntriesToLegacy(day.startsWithOddCycle, []);
  return rhythmEffectiveMinutes(
    {
      ...legacy,
      startsWithOddCycle: day.startsWithOddCycle,
    },
    cfg,
  );
}

export type DisplayPair = {
  key: string;
  odd?: { entry: RhythmFlipEntry; index: number };
  even?: { entry: RhythmFlipEntry; index: number };
};

export function groupEntriesInPairs(
  startsWithOdd: boolean,
  entries: RhythmFlipEntry[],
): DisplayPair[] {
  const pairs: DisplayPair[] = [];
  let pairIndex = 0;
  for (let i = 0; i < entries.length; ) {
    const isOdd = entryParityIsOdd(startsWithOdd, entries, i);
    const pair: DisplayPair = { key: `p-${pairIndex++}` };
    if (isOdd) {
      pair.odd = { entry: entries[i], index: i };
      i++;
      if (i < entries.length && !entryParityIsOdd(startsWithOdd, entries, i)) {
        pair.even = { entry: entries[i], index: i };
        i++;
      }
    } else {
      pair.even = { entry: entries[i], index: i };
      i++;
      if (i < entries.length && entryParityIsOdd(startsWithOdd, entries, i)) {
        pair.odd = { entry: entries[i], index: i };
        i++;
      }
    }
    pairs.push(pair);
  }
  return pairs;
}

export type DayFlipStructure = {
  /** Sand left in upper bulb at day start (1–9), or null if none. */
  startPartialTenths: number | null;
  completeCount: number;
  /** Sand in lower bulb at day end (1–9), or null if none. */
  endPartialLowerTenths: number | null;
};

/** Partials only at start/end; middle entries are complete flips only. */
export function parseDayFlipStructure(entries: RhythmFlipEntry[]): DayFlipStructure {
  if (entries.length === 0) {
    return { startPartialTenths: null, completeCount: 0, endPartialLowerTenths: null };
  }
  let startPartialTenths: number | null = null;
  let idx = 0;
  const first = entries[0];
  if (isStartPartialEntry(first, 0)) {
    startPartialTenths = first.remainingTenths ?? null;
    idx = 1;
  }
  let completeCount = 0;
  let endPartialLowerTenths: number | null = null;
  for (; idx < entries.length; idx++) {
    const e = entries[idx];
    if (isEndPartialEntry(e, idx, entries)) {
      endPartialLowerTenths = endPartialLowerTenthsFromEntry(e);
      break;
    }
    if (e.kind === "complete") completeCount++;
    else break;
  }
  return { startPartialTenths, completeCount, endPartialLowerTenths };
}

function endPartialLowerTenthsFromEntry(entry: RhythmFlipEntry): number {
  return endPartialLowerTenths(entry);
}

export function buildDayFlipEntries(
  structure: DayFlipStructure,
  previous: RhythmFlipEntry[] = [],
): RhythmFlipEntry[] {
  const startPrev =
    previous[0]?.kind === "partial" ? previous[0] : undefined;
  const endPrev =
    previous.length > 0 && previous[previous.length - 1].kind === "partial"
      ? previous[previous.length - 1]
      : undefined;
  const completePrev = previous.filter((e) => e.kind === "complete");

  const out: RhythmFlipEntry[] = [];
  if (structure.startPartialTenths != null && structure.startPartialTenths > 0) {
    out.push({
      id: startPrev?.id ?? newEntryId(),
      kind: "partial",
      remainingTenths: Math.min(9, Math.max(1, structure.startPartialTenths)),
    });
  }
  for (let i = 0; i < structure.completeCount; i++) {
    const prev = completePrev[i];
    out.push(prev ?? { id: newEntryId(), kind: "complete" });
  }
  if (structure.endPartialLowerTenths != null && structure.endPartialLowerTenths > 0) {
    const endId =
      endPrev && endPrev !== startPrev ? endPrev.id : newEntryId();
    out.push({
      id: endId,
      kind: "partial",
      lowerTenths: clampTenth(structure.endPartialLowerTenths),
    });
  }
  return out;
}

export function addCompleteEntries(
  entries: RhythmFlipEntry[],
  count: number,
): RhythmFlipEntry[] {
  const out = [...entries];
  for (let i = 0; i < count; i++) {
    out.push({ id: newEntryId(), kind: "complete" });
  }
  return out;
}

export function addPartialEntry(
  entries: RhythmFlipEntry[],
  remainingTenths: number,
): RhythmFlipEntry[] {
  return [
    ...entries,
    {
      id: newEntryId(),
      kind: "partial",
      remainingTenths: Math.min(9, Math.max(1, remainingTenths)),
    },
  ];
}

export function endStateFromEntries(
  startsWithOdd: boolean,
  entries: RhythmFlipEntry[],
): { nextStartsOdd: boolean; endRemainingTenths: number } {
  let isOdd = startsWithOdd;
  let carryUpper = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.kind === "complete") {
      isOdd = !isOdd;
      carryUpper = 0;
    } else if (isStartPartialEntry(e, i)) {
      isOdd = !isOdd;
      carryUpper = 0;
    } else if (isEndPartialEntry(e, i, entries)) {
      const lower = endPartialLowerTenthsFromEntry(e);
      carryUpper = 10 - lower;
    }
  }
  if (carryUpper > 0) {
    return { nextStartsOdd: isOdd, endRemainingTenths: carryUpper };
  }
  return { nextStartsOdd: isOdd, endRemainingTenths: 0 };
}
