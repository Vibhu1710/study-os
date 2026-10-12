"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { DayStat } from "@/components/calendar/ContributionCalendar";
import type { DateString } from "@/lib/dates";
import { toDateString } from "@/lib/dates";
import { canPlanOnDay, type PhaseBounds } from "@/lib/study-day";
import { getCalendarDayPresentation } from "@/lib/calendar-day-visual";
import { formatWeightDisplay } from "@/lib/weight";
import { PhaseBlockSvgOutline } from "@/components/calendar/PhaseBlockSvgOutline";

/** Mini main-calendar grid for picking a plan day (heat + hover tooltips). */
export function CompactPlanDateGrid({
  days,
  today,
  objectiveStart,
  objectiveEnd,
  phase,
  topicAssignedDates,
  selectedDate,
  initialMonth,
  onSelect,
  selectionMode = "futurePlan",
}: {
  days: Record<string, DayStat>;
  today: DateString;
  objectiveStart: DateString;
  objectiveEnd: DateString;
  phase: PhaseBounds | null;
  /** Dates this topic is already scheduled on (reschedule) — dashed ring only. */
  topicAssignedDates: string[];
  /** Highlighted pick (confirm with Save in parent). */
  selectedDate?: DateString | "";
  initialMonth?: DateString;
  onSelect: (date: DateString) => void;
  /** `pastLog` = syllabus edit log (objective past days only, before today). */
  selectionMode?: "futurePlan" | "pastLog";
}) {
  const phaseStart = phase?.startDate ?? null;
  const phaseEnd = phase?.endDate ?? null;
  const hasPhase = Boolean(phaseStart && phaseEnd);

  const anchor = initialMonth
    ? parseISO(initialMonth)
    : topicAssignedDates[0]
      ? parseISO(topicAssignedDates[0])
      : parseISO(today);

  const [viewMonth, setViewMonth] = useState(() => startOfMonth(anchor));
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const dayGridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setViewMonth(startOfMonth(anchor));
  }, [initialMonth, topicAssignedDates[0], today]);

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const cells = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const cellKeys = useMemo(
    () => cells.map((d) => toDateString(d)),
    [cells],
  );

  const completedWeightBounds = useMemo(() => {
    let max = 0;
    let min = Infinity;
    for (const stat of Object.values(days)) {
      const w = stat?.totalWeight ?? 0;
      if (w > max) max = w;
      if (w > 0 && w < min) min = w;
    }
    return {
      maxObjectiveCompletedWeight: Math.max(1, max),
      minObjectiveCompletedWeight: min === Infinity ? 0 : min,
    };
  }, [days]);

  const hoverStat = hoverDate ? days[hoverDate] : null;
  const assignedSet = useMemo(
    () => new Set(topicAssignedDates),
    [topicAssignedDates],
  );

  function planDisabled(key: DateString) {
    if (key < objectiveStart || key > objectiveEnd) return true;
    if (selectionMode === "pastLog") {
      return key >= today;
    }
    if (key < today) return true;
    return !canPlanOnDay(key, objectiveStart, objectiveEnd, phase);
  }

  return (
    <div className="relative [--phase-cell-base:#1c2128]">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          className="btn px-2 py-0.5 text-xs"
          onClick={() => setViewMonth((m) => subMonths(m, 1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="font-mono text-xs font-medium">{format(viewMonth, "MMMM yyyy")}</span>
        <button
          type="button"
          className="btn px-2 py-0.5 text-xs"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-[6px] overflow-visible px-[6px]">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div
            key={i}
            className="text-center font-mono text-[9px] text-[var(--text-muted)]"
          >
            {d}
          </div>
        ))}
      </div>

      <div
        ref={dayGridRef}
        className="relative grid grid-cols-7 gap-[6px] overflow-visible rounded-md p-[6px] [--calendar-cell-gap:6px]"
        style={{ background: "transparent" }}
      >
        {hasPhase && (
          <PhaseBlockSvgOutline
            gridRef={dayGridRef}
            cellKeys={cellKeys}
            phaseStart={phaseStart}
            phaseEnd={phaseEnd}
            objectiveStart={objectiveStart}
            objectiveEnd={objectiveEnd}
            className="pointer-events-none absolute inset-0 z-[5]"
          />
        )}
        {cells.map((cellDate) => {
          const key = toDateString(cellDate);
          const inMonth = isSameMonth(cellDate, viewMonth);
          const stat = days[key] ?? {};
          const outOfObjective = key < objectiveStart || key > objectiveEnd;
          const disabled = outOfObjective || planDisabled(key);
          const isTopicHere = assignedSet.has(key);
          const isPicked = Boolean(selectedDate && selectedDate === key);
          const isToday = key === today;
          const presentation = getCalendarDayPresentation(key, today, {
            outOfObjective,
            completedWeight: stat.totalWeight ?? 0,
            plannedWeight: stat.plannedTotalWeight ?? 0,
            completedSlices: stat.completedSubjectBreakdown ?? [],
            plannedSlices: stat.plannedSubjectBreakdown ?? [],
            ...completedWeightBounds,
          });

          return (
            <div key={key} data-calendar-day className="relative overflow-visible">
            <button
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onSelect(key)}
              onMouseEnter={(e) => {
                if (outOfObjective) return;
                setHoverDate(key);
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
              }}
              onMouseLeave={() => {
                setHoverDate(null);
                setTooltipPos(null);
              }}
              className={cn(
                "relative isolate flex aspect-square min-h-[1.75rem] w-full items-center justify-center overflow-hidden rounded-[4px] font-mono text-[11px] leading-none transition-[filter,box-shadow]",
                !inMonth && "opacity-30",
                disabled && !outOfObjective && "cursor-not-allowed opacity-40",
                outOfObjective && "cursor-not-allowed opacity-15",
                !disabled &&
                  !isPicked &&
                  !isTopicHere &&
                  "hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)]",
                isTopicHere &&
                  !isPicked &&
                  "z-[2] shadow-[0_0_0_2px_var(--text)] ring-2 ring-inset ring-dashed ring-[var(--text)]/90",
                isPicked &&
                  "z-[3] shadow-[0_0_0_2px_var(--text)] ring-2 ring-inset ring-[var(--text)]",
              )}
            >
              {!outOfObjective && (
                <span
                  className="pointer-events-none absolute inset-0 rounded-[4px]"
                  style={{ backgroundColor: presentation.background }}
                  aria-hidden
                />
              )}
              {presentation.topStripe && presentation.topStripeWidthFrac > 0 && (
                <span
                  className="pointer-events-none absolute left-0 top-0 z-[1] h-0.5 rounded-tl-[3px] opacity-90"
                  style={{
                    background: presentation.topStripe,
                    width: `${presentation.topStripeWidthFrac * 100}%`,
                  }}
                />
              )}
              {presentation.bottomStripe && presentation.bottomStripeWidthFrac > 0 && (
                <span
                  className="pointer-events-none absolute bottom-0 left-0 z-[1] h-0.5 rounded-bl-[3px] opacity-90"
                  style={{
                    background: presentation.bottomStripe,
                    width: `${presentation.bottomStripeWidthFrac * 100}%`,
                  }}
                />
              )}
              <span
                className={cn(
                  "relative z-[2]",
                  isToday && !outOfObjective
                    ? "font-semibold text-[var(--accent)]"
                    : "text-[var(--text)]",
                )}
              >
                {format(cellDate, "d")}
              </span>
              {presentation.topWeightLabel != null && (
                <span
                  className="absolute right-1 top-[6px] z-[2] font-mono text-[7px] font-semibold leading-none text-[var(--text)]"
                  style={{ textShadow: "0 0 4px var(--bg-elevated)" }}
                >
                  {formatWeightDisplay(presentation.topWeightLabel)}
                </span>
              )}
              {presentation.bottomWeightLabel != null && (
                <span
                  className="absolute bottom-[6px] right-1 z-[2] font-mono text-[7px] font-semibold leading-none text-[var(--text)]"
                  style={{ textShadow: "0 0 4px var(--bg-elevated)" }}
                >
                  {formatWeightDisplay(presentation.bottomWeightLabel)}
                </span>
              )}
            </button>
            </div>
          );
        })}
      </div>

      <p className="mt-2 font-mono text-[9px] text-[var(--text-muted)]">
        Hover for what&apos;s on each day · select a day, then Save
        {topicAssignedDates.length > 0 && (
          <span className="text-[var(--text)]">
            {" "}
            · dashed outline = this topic&apos;s current day
          </span>
        )}
      </p>

      {hoverDate && tooltipPos && hoverStat && (
        <div
          className="pointer-events-none fixed z-[250] max-w-[260px] -translate-x-1/2 -translate-y-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 shadow-lg"
          style={{ left: tooltipPos.x, top: tooltipPos.y - 8 }}
        >
          <p className="font-mono text-[10px] text-[var(--text-muted)]">
            {format(parseISO(hoverDate), "d MMM yyyy")}
          </p>
          {(hoverStat.totalWeight ?? 0) > 0 || (hoverStat.plannedTotalWeight ?? 0) > 0 ? (
            <>
              {(hoverStat.totalWeight ?? 0) > 0 && (
                <p className="mt-1 text-xs">
                  {formatWeightDisplay(hoverStat.totalWeight ?? 0)} wt completed
                  {hoverStat.isProjection && (
                    <span className="text-[var(--accent-amber)]"> · projected</span>
                  )}
                </p>
              )}
              {(hoverStat.plannedTotalWeight ?? 0) > 0 && (
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {formatWeightDisplay(hoverStat.plannedTotalWeight ?? 0)} wt planned
                </p>
              )}
              {hoverStat.previews && hoverStat.previews.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-[10px] text-[var(--text-muted)]">
                  {hoverStat.previews.map((p) => (
                    <li key={p} className="truncate">{p}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="mt-1 text-xs text-[var(--text-muted)]">No activity</p>
          )}
          {(hoverStat.completedSubjectBreakdown?.length ?? 0) > 0 && (
            <ul className="mt-2 space-y-0.5 border-t border-[var(--border)] pt-2 text-[10px]">
              <li className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
                Completed
              </li>
              {hoverStat.completedSubjectBreakdown!.map((s) => (
                <li key={s.subjectId} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 truncate">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: s.color }}
                    />
                    {s.name}
                  </span>
                  <span className="font-mono text-[var(--text-muted)]">{s.weight} wt</span>
                </li>
              ))}
            </ul>
          )}
          {(hoverStat.plannedSubjectBreakdown?.length ?? 0) > 0 && (
            <ul className="mt-2 space-y-0.5 border-t border-[var(--border)] pt-2 text-[10px]">
              <li className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
                Planned
              </li>
              {hoverStat.plannedSubjectBreakdown!.map((s) => (
                <li key={`p-${s.subjectId}`} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 truncate">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: s.color }}
                    />
                    {s.name}
                  </span>
                  <span className="font-mono text-[var(--text-muted)]">{s.weight} wt</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
