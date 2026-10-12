"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { DateString } from "@/lib/dates";
import { addDaysString, maxDateString, parseDateString, toDateString } from "@/lib/dates";

export type DateDisableReason =
  | "before-min"
  | "after-max"
  | "too-short-span"
  | "short-remainder"
  | "locked-cycle"
  | "custom";

export type DatePickerCalendarHints = {
  /** Shown on end picker: chosen range start (anchor). */
  anchorStart?: DateString;
  /** Inclusive band [bandFrom, bandTo] — days too early to pick as end (min span). */
  bandFrom?: DateString;
  bandTo?: DateString;
  /** Cycle end — highlighted when it is the only legal end. */
  cycleEnd?: DateString;
  /** Extra legend lines under the grid. */
  legend?: string[];
};

function disableReasonForDay(
  s: DateString,
  min?: DateString,
  max?: DateString,
  isDateDisabled?: (date: DateString) => boolean,
  hints?: DatePickerCalendarHints,
  endLockedToCycle?: boolean,
): DateDisableReason | null {
  if (
    hints?.bandFrom &&
    hints.bandTo &&
    s >= hints.bandFrom &&
    s <= hints.bandTo
  ) {
    return "too-short-span";
  }
  if (endLockedToCycle && hints?.cycleEnd && s !== hints.cycleEnd) {
    if (min && s < min) return "before-min";
    if (max && s > max) return "after-max";
    return "locked-cycle";
  }
  if (min && s < min) return "before-min";
  if (max && s > max) return "after-max";
  if (isDateDisabled?.(s)) return "short-remainder";
  return null;
}

function dayIsDisabled(
  s: DateString,
  min?: DateString,
  max?: DateString,
  isDateDisabled?: (date: DateString) => boolean,
  hints?: DatePickerCalendarHints,
  endLockedToCycle?: boolean,
): boolean {
  return (
    disableReasonForDay(s, min, max, isDateDisabled, hints, endLockedToCycle) !==
    null
  );
}

export function DatePicker({
  value,
  onChange,
  label,
  min,
  max,
  required,
  disabled = false,
  isDateDisabled,
  calendarHints,
  endLockedToCycle = false,
  className,
  placeholder = "Pick date",
  hintWhenDisabled,
}: {
  value: DateString | "";
  onChange: (date: DateString) => void;
  label?: string;
  min?: DateString;
  max?: DateString;
  required?: boolean;
  disabled?: boolean;
  isDateDisabled?: (date: DateString) => boolean;
  calendarHints?: DatePickerCalendarHints;
  /** Only `calendarHints.cycleEnd` is selectable (plus min/max). */
  endLockedToCycle?: boolean;
  className?: string;
  placeholder?: string;
  hintWhenDisabled?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const anchor = value ? parseDateString(value) : new Date();
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(anchor));

  useEffect(() => {
    if (value) setViewMonth(startOfMonth(parseDateString(value)));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function dayDisabled(d: Date) {
    const s = toDateString(d);
    return dayIsDisabled(s, min, max, isDateDisabled, calendarHints, endLockedToCycle);
  }

  function selectDay(d: Date) {
    if (dayDisabled(d)) return;
    onChange(toDateString(d));
    setOpen(false);
  }

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const display = value
    ? format(parseISO(value), "d MMM yyyy")
    : placeholder;

  const legend = calendarHints?.legend ?? [];
  const showLegend = legend.length > 0 || min || max;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {label && (
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </span>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={listId}
        disabled={disabled}
        title={disabled ? hintWhenDisabled : undefined}
        className={cn(
          "input flex w-full items-center justify-between gap-2 text-left font-mono text-xs",
          !value && "text-[var(--text-muted)]",
          disabled && "cursor-not-allowed opacity-60",
        )}
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
      >
        <span>{display}</span>
        <CalendarIcon />
      </button>
      {hintWhenDisabled && disabled && (
        <p className="mt-1 text-[10px] text-[var(--text-muted)]">{hintWhenDisabled}</p>
      )}
      {required && !value && (
        <input
          tabIndex={-1}
          className="pointer-events-none absolute opacity-0"
          required
          value=""
          onChange={() => {}}
        />
      )}

      {open && (
        <div
          id={listId}
          role="dialog"
          aria-label={label ?? "Choose date"}
          className="absolute left-0 top-full z-50 mt-1 w-[min(100%,18.5rem)] rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-xl shadow-black/40"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="btn px-2 py-1 text-xs"
              onClick={() => setViewMonth((m) => subMonths(m, 1))}
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className="font-mono text-xs font-medium">
              {format(viewMonth, "MMMM yyyy")}
            </span>
            <button
              type="button"
              className="btn px-2 py-1 text-xs"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5 text-center font-mono text-[9px] text-[var(--text-muted)]">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <div key={i} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {days.map((day) => {
              const key = toDateString(day);
              const inMonth = day.getMonth() === viewMonth.getMonth();
              const selected = value === key;
              const disabledDay = dayDisabled(day);
              const reason = disableReasonForDay(
                key,
                min,
                max,
                isDateDisabled,
                calendarHints,
                endLockedToCycle,
              );
              const isToday = key === toDateString(new Date());
              const isAnchorStart = calendarHints?.anchorStart === key;
              const isCycleEnd = calendarHints?.cycleEnd === key;
              const inTooShortBand =
                !disabledDay &&
                calendarHints?.bandFrom &&
                calendarHints?.bandTo &&
                key >= calendarHints.bandFrom &&
                key <= calendarHints.bandTo;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabledDay}
                  title={
                    reason === "too-short-span"
                      ? "Too few days from start for minimum length"
                      : reason === "short-remainder"
                        ? "Would leave fewer than 7 days in the study cycle"
                        : reason === "locked-cycle"
                          ? "Only the study cycle end date can be chosen"
                          : undefined
                  }
                  onClick={() => selectDay(day)}
                  className={cn(
                    "relative h-8 rounded-sm font-mono text-xs transition-colors",
                    !inMonth && "text-[var(--text-muted)] opacity-40",
                    disabledDay &&
                      reason === "too-short-span" &&
                      "cursor-not-allowed bg-[var(--accent-amber)]/10 opacity-35 line-through decoration-[var(--accent-amber)]/50",
                    disabledDay &&
                      reason === "short-remainder" &&
                      "cursor-not-allowed bg-[var(--danger)]/10 opacity-30",
                    disabledDay &&
                      reason === "locked-cycle" &&
                      "cursor-not-allowed opacity-15",
                    disabledDay &&
                      (reason === "before-min" || reason === "after-max") &&
                      "cursor-not-allowed opacity-20",
                    !disabledDay &&
                      !selected &&
                      "hover:bg-[var(--bg-muted)] hover:text-[var(--accent)]",
                    selected && "bg-[var(--accent)] font-semibold text-[#0d1117]",
                    isToday && !selected && "ring-1 ring-[var(--accent-amber)]",
                    isAnchorStart &&
                      !selected &&
                      "ring-2 ring-[var(--accent)]/80 ring-offset-1 ring-offset-[var(--bg-elevated)]",
                    isCycleEnd &&
                      endLockedToCycle &&
                      !selected &&
                      "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg-elevated)]",
                    inTooShortBand && "bg-[var(--accent-amber)]/5",
                  )}
                >
                  {format(day, "d")}
                  {isAnchorStart && (
                    <span
                      className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[var(--accent)]"
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>

          {showLegend && (
            <div className="mt-2 space-y-1 border-t border-[var(--border)] pt-2">
              {legend.map((line, i) => (
                <p
                  key={i}
                  className="font-mono text-[9px] leading-snug text-[var(--text-muted)]"
                >
                  {line}
                </p>
              ))}
              {legend.length === 0 && (min || max) && (
                <p className="font-mono text-[9px] text-[var(--text-muted)]">
                  {min && max ? `Allowed: ${min} → ${max}` : min ? `From ${min}` : `Until ${max}`}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DateRangePickers({
  start,
  end,
  onStartChange,
  onEndChange,
  min,
  max,
  minSpanDays = 1,
  isEndDateDisabled,
  startLabel = "Start",
  endLabel = "End",
  requireStartFirst = true,
  capStartByEnd = false,
  cycleEndDate,
  endLockedToCycle = false,
  startLegendExtra,
  endLegendExtra,
  startDisabled = false,
}: {
  start: DateString | "";
  end: DateString | "";
  onStartChange: (d: DateString) => void;
  onEndChange: (d: DateString) => void;
  min?: DateString;
  max?: DateString;
  /** Inclusive length. End cannot fall before start + (minSpanDays − 1). */
  minSpanDays?: number;
  isEndDateDisabled?: (date: DateString) => boolean;
  startLabel?: string;
  endLabel?: string;
  /** End picker stays closed until a start date is chosen. */
  requireStartFirst?: boolean;
  /** If true, start cannot be after current end (legacy). Default false — start is source of truth. */
  capStartByEnd?: boolean;
  cycleEndDate?: DateString;
  endLockedToCycle?: boolean;
  startLegendExtra?: string[];
  endLegendExtra?: string[];
  /** Start picker is read-only (value still shown in the control). */
  startDisabled?: boolean;
}) {
  function earliestEnd(startDate: DateString): DateString {
    return addDaysString(startDate, Math.max(0, minSpanDays - 1));
  }

  function handleStart(d: DateString) {
    onStartChange(d);
    const floor = earliestEnd(d);
    if (end && end < floor) {
      onEndChange(max && floor > max ? max : floor);
    } else if (end && d > end) {
      onEndChange(floor > (max ?? floor) ? (max as DateString) : floor);
    }
    if (endLockedToCycle && cycleEndDate) {
      onEndChange(cycleEndDate);
    }
  }

  function handleEnd(d: DateString) {
    onEndChange(d);
    if (start && d < start) onStartChange(d);
  }

  const startMax = capStartByEnd && end ? end : max;
  const endReady = !requireStartFirst || Boolean(start);
  const earliest = start ? earliestEnd(start) : undefined;
  const bandTo =
    start && minSpanDays > 1
      ? addDaysString(start, minSpanDays - 2)
      : undefined;

  const startLegend = [
    ...(min ? [`Earliest: ${min}`] : []),
    ...(startMax ? [`Latest: ${startMax}`] : []),
    "Pick start first — end options follow from here.",
    ...(startLegendExtra ?? []),
  ];

  const endLegend = !start
    ? ["Choose a start date to see valid end dates."]
    : endLockedToCycle && cycleEndDate
      ? [
          `Start: ${start} (marked on calendar)`,
          `Only cycle end ${cycleEndDate} is valid — not enough room for another phase.`,
          ...(endLegendExtra ?? []),
        ]
      : [
          `Start: ${start} (ring on calendar)`,
          earliest
            ? `Earliest end: ${earliest} (${minSpanDays} day${minSpanDays === 1 ? "" : "s"} inclusive)`
            : null,
          max ? `Latest end: ${max}` : null,
          minSpanDays > 1
            ? `Dates from ${start} through ${bandTo} are too short to pick as end.`
            : null,
          ...(endLegendExtra ?? []),
        ].filter((x): x is string => Boolean(x));

  const endCalendarHints: DatePickerCalendarHints | undefined = start
    ? {
        anchorStart: start,
        bandFrom: minSpanDays > 1 ? start : undefined,
        bandTo: bandTo && bandTo >= start ? bandTo : undefined,
        cycleEnd: cycleEndDate,
        legend: endLegend,
      }
    : { legend: endLegend };

  function mergedEndDisabled(d: DateString) {
    if (endLockedToCycle && cycleEndDate && d !== cycleEndDate) {
      return true;
    }
    return isEndDateDisabled?.(d) ?? false;
  }

  const endPickerMin = (() => {
    const spanFloor =
      start && !endLockedToCycle ? earliest : undefined;
    if (spanFloor && min) return maxDateString(spanFloor, min);
    return spanFloor ?? min;
  })();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <DatePicker
        label={startLabel}
        value={start}
        onChange={handleStart}
        min={min}
        max={startMax}
        disabled={startDisabled}
        calendarHints={{ legend: startLegend }}
        required
      />
      <DatePicker
        label={endLabel}
        value={end}
        onChange={handleEnd}
        min={endPickerMin}
        max={max}
        disabled={!endReady}
        hintWhenDisabled={
          requireStartFirst ? "Choose the start date first." : undefined
        }
        isDateDisabled={mergedEndDisabled}
        calendarHints={endCalendarHints}
        endLockedToCycle={endLockedToCycle}
        required
      />
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      className="shrink-0 text-[var(--text-muted)]"
      aria-hidden
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
