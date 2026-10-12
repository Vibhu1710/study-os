import { addDays, eachDayOfInterval, format, parseISO, startOfDay } from "date-fns";
import {
  inclusiveDayCount,
  MIN_OBJECTIVE_DAYS,
  MIN_PHASE_DAYS,
} from "@/lib/date-span";

export type DateString = string; // YYYY-MM-DD

export {
  inclusiveDayCount,
  MIN_OBJECTIVE_DAYS,
  MIN_PHASE_DAYS,
} from "@/lib/date-span";

export function toDateString(d: Date): DateString {
  return format(d, "yyyy-MM-dd");
}

export function parseDateString(s: DateString): Date {
  return startOfDay(parseISO(s));
}

export function datesOverlap(
  aStart: DateString,
  aEnd: DateString,
  bStart: DateString,
  bEnd: DateString,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function isDateInRange(
  date: DateString,
  start: DateString,
  end: DateString,
): boolean {
  return date >= start && date <= end;
}

export function minDateString(a: DateString, b: DateString): DateString {
  return a <= b ? a : b;
}

export function maxDateString(a: DateString, b: DateString): DateString {
  return a >= b ? a : b;
}

export function eachDateString(start: DateString, end: DateString): DateString[] {
  if (start > end) return [];
  return eachDayOfInterval({
    start: parseDateString(start),
    end: parseDateString(end),
  }).map(toDateString);
}

export function addDaysString(date: DateString, days: number): DateString {
  return toDateString(addDays(parseDateString(date), days));
}

/** Latest date that still makes [start, end] last MIN_PHASE_DAYS. */
export function minPhaseEndDate(start: DateString): DateString {
  return addDaysString(start, MIN_PHASE_DAYS - 1);
}

export function minObjectiveEndDate(start: DateString): DateString {
  return addDaysString(start, MIN_OBJECTIVE_DAYS - 1);
}

/** Days after phaseEnd through objectiveEnd. Zero when the phase ends the cycle. */
export function phaseRemainderDays(
  phaseEnd: DateString,
  objectiveEnd: DateString,
): number {
  if (phaseEnd >= objectiveEnd) return 0;
  return inclusiveDayCount(addDaysString(phaseEnd, 1), objectiveEnd);
}

/** True when 1–6 days would be left after the phase, which cannot be its own phase. */
export function phaseEndLeavesShortRemainder(
  phaseEnd: DateString,
  objectiveEnd: DateString,
): boolean {
  const remainder = phaseRemainderDays(phaseEnd, objectiveEnd);
  return remainder > 0 && remainder < MIN_PHASE_DAYS;
}

/** Fewer than two phase-weeks remain, so the only legal end is the cycle end. */
export function phaseEndLockedToCycle(
  phaseStart: DateString,
  objectiveEnd: DateString,
): boolean {
  return inclusiveDayCount(phaseStart, objectiveEnd) < MIN_PHASE_DAYS * 2;
}

/** Latest start that still allows a full MIN_PHASE_DAYS run through objectiveEnd. */
export function maxPhaseStartDate(objectiveEnd: DateString): DateString {
  return addDaysString(objectiveEnd, -(MIN_PHASE_DAYS - 1));
}

/** False when start is so late that even ending on the cycle end would be < MIN_PHASE_DAYS. */
export function hasRoomForMinPhase(
  phaseStart: DateString,
  objectiveEnd: DateString,
): boolean {
  return inclusiveDayCount(phaseStart, objectiveEnd) >= MIN_PHASE_DAYS;
}

