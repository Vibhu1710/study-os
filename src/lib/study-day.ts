import type { DateString } from "@/lib/dates";
import { isDateInRange, toDateString } from "@/lib/dates";

export function todayString(): DateString {
  return toDateString(new Date());
}

export type PhaseBounds = { startDate: DateString; endDate: DateString };

export function isDateInPhase(
  date: DateString,
  phase: PhaseBounds,
): boolean {
  return date >= phase.startDate && date <= phase.endDate;
}

/** Assign topics to a day (including future days within the current phase). */
export function canPlanOnDay(
  date: DateString,
  objectiveStart: DateString,
  objectiveEnd: DateString,
  phase: PhaseBounds | null,
): boolean {
  if (!phase) return false;
  if (!isDateInRange(date, objectiveStart, objectiveEnd)) return false;
  return isDateInPhase(date, phase);
}

/** Mark complete / undo — only on the live calendar day (today). */
export function canCompleteOnDay(
  date: DateString,
  objectiveStart: DateString,
  objectiveEnd: DateString,
  phase: PhaseBounds | null,
  today: DateString = todayString(),
): boolean {
  if (!canPlanOnDay(date, objectiveStart, objectiveEnd, phase)) return false;
  return date === today;
}

export function assertCanPlanOnDay(
  date: DateString,
  objectiveStart: DateString,
  objectiveEnd: DateString,
  phase: PhaseBounds | null,
) {
  if (!phase) {
    throw new Error("Set a phase before planning days.");
  }
  if (!canPlanOnDay(date, objectiveStart, objectiveEnd, phase)) {
    throw new Error(
      "You can only plan days inside the current phase (from its start through its end date).",
    );
  }
}

export function assertCanCompleteOnDay(
  date: DateString,
  objectiveStart: DateString,
  objectiveEnd: DateString,
  phase: PhaseBounds | null,
) {
  assertCanPlanOnDay(date, objectiveStart, objectiveEnd, phase);
  if (date !== todayString()) {
    throw new Error("Completions can only be changed on today's date.");
  }
}
