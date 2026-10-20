import { addDays, eachDayOfInterval, format, parseISO, startOfDay } from "date-fns";
import { MIN_OBJECTIVE_DAYS } from "@/lib/date-span";

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

export function minObjectiveEndDate(start: DateString): DateString {
  return addDaysString(start, MIN_OBJECTIVE_DAYS - 1);
}

