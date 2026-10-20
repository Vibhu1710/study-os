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
import { DroppableCalendarDay } from "@/components/home/PlanTopicDragDrop";
import { toDateString } from "@/lib/dates";
import { getCalendarDayPresentation } from "@/lib/calendar-day-visual";
import {
  formatRhythmDuration,
  formatRhythmDurationCompact,
} from "@/lib/rhythm/effective-minutes";
import { formatWeightDisplay } from "@/lib/weight";
import { PhaseBlockSvgOutline } from "@/components/calendar/PhaseBlockSvgOutline";

export type SubjectDaySlice = {
  subjectId: string;
  name: string;
  color: string;
  weight: number;
};

export type DayStat = {
  /** Completed / logged weight for the day. */
  totalWeight: number;
  plannedTotalWeight?: number;
  completedSubjectBreakdown?: SubjectDaySlice[];
  plannedSubjectBreakdown?: SubjectDaySlice[];
  completionCount?: number;
  plannedCount?: number;
  previews?: string[];
  /** Today's ticks are live projections until midnight. */
  isProjection?: boolean;
  /** Rhythm tab: effective study minutes (for mixed tooltips). */
  rhythmEffectiveMinutes?: number;
  rhythmStartTime?: string;
  rhythmEndTime?: string;
  rhythmBreakMinutes?: number;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ContributionCalendar({
  selectedDate,
  initialMonth,
  days,
  objectiveStart,
  objectiveEnd,
  phaseStart,
  phaseEnd,
  phaseName,
  selectedOutsidePhase = false,
  today,
  onSelect,
  planDayDropTargets = false,
  planDropHighlightDate = null,
  canReceivePlanDrop,
  disableFutureDays = false,
  showPhaseOutline = true,
  showPhaseCaption = true,
  effortHeat = false,
  coverageDays,
  heatViewToggle,
}: {
  selectedDate: string;
  initialMonth?: string;
  days: Record<string, DayStat>;
  objectiveStart: string;
  objectiveEnd: string;
  phaseStart?: string | null;
  phaseEnd?: string | null;
  phaseName?: string | null;
  /** Selected day is outside the active phase range (inline hint by sprint caption). */
  selectedOutsidePhase?: boolean;
  today: string;
  onSelect: (date: string) => void;
  /** Allow dropping day-plan topic cards onto calendar cells. */
  planDayDropTargets?: boolean;
  /** Date under the pointer while dragging a topic card. */
  planDropHighlightDate?: string | null;
  canReceivePlanDrop?: (date: string) => boolean;
  /** Rhythm: cannot select dates after today. */
  disableFutureDays?: boolean;
  showPhaseOutline?: boolean;
  /** Phase name + date range above the grid (home/syllabus). */
  showPhaseCaption?: boolean;
  /** Label heat tooltips as effective study time (totalWeight = hours). */
  effortHeat?: boolean;
  /** Mixed tooltip: coverage stats when effortHeat is on. */
  coverageDays?: Record<string, DayStat>;
  /** Rhythm page: Effort / Coverage heat inside the calendar header. */
  heatViewToggle?: {
    mode: "effort" | "coverage";
    onChange: (mode: "effort" | "coverage") => void;
  };
}) {
  const [viewMonth, setViewMonth] = useState(() =>
    startOfMonth(initialMonth ? parseISO(initialMonth) : parseISO(selectedDate)),
  );
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const dayGridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setViewMonth(startOfMonth(parseISO(selectedDate)));
  }, [selectedDate]);

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
      const w = effortHeat
        ? (stat?.rhythmEffectiveMinutes ?? 0) / 60
        : (stat?.totalWeight ?? 0);
      if (w > max) max = w;
      if (w > 0 && w < min) min = w;
    }
    return {
      maxObjectiveCompletedWeight: Math.max(1, max),
      minObjectiveCompletedWeight: min === Infinity ? 0 : min,
    };
  }, [days, effortHeat]);

  const hoverStat = hoverDate
    ? (days[hoverDate] ?? coverageDays?.[hoverDate] ?? null)
    : null;
  const hasPhase = Boolean(phaseStart && phaseEnd);
  /** Rhythm tab: hide syllabus weight numerals; show effective time separately. */
  const isRhythmCalendar = Boolean(heatViewToggle);

  return (
    <div className="card relative w-full p-4 [--phase-cell-base:#1c2128]">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn px-2 py-1 text-sm"
              onClick={() => setViewMonth((m) => subMonths(m, 1))}
              aria-label="Previous month"
            >
              ‹
            </button>
            <h2 className="min-w-[9rem] text-center font-mono text-base font-semibold tracking-tight">
              {format(viewMonth, "MMMM yyyy")}
            </h2>
            <button
              type="button"
              className="btn px-2 py-1 text-sm"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              aria-label="Next month"
            >
              ›
            </button>
          </div>
          <p className="mt-1 font-mono text-[10px] text-[var(--text-muted)]">
            Selected{" "}
            <span className="text-[var(--accent)]">
              {format(parseISO(selectedDate), "EEE d MMM yyyy")}
            </span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
          {heatViewToggle && (
            <div
              className="inline-flex rounded-lg border border-[var(--border)] p-0.5"
              role="tablist"
              aria-label="Calendar heat view"
            >
              {(
                [
                  { id: "effort" as const, label: "Effort" },
                  { id: "coverage" as const, label: "Coverage" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={heatViewToggle.mode === m.id}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-mono text-[10px]",
                    heatViewToggle.mode === m.id
                      ? "bg-[var(--accent)] font-semibold text-[#0d1117]"
                      : "text-[var(--text-muted)]",
                  )}
                  onClick={() => heatViewToggle.onChange(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className="btn text-xs"
            onClick={() => {
              setViewMonth(startOfMonth(parseISO(today)));
              onSelect(today);
            }}
          >
            Today
          </button>
        </div>
      </div>

      {hasPhase && showPhaseCaption && (
        <div className="mb-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <p className="font-mono text-[10px] text-[var(--text-muted)]">
            <span className="text-[var(--text)]">{phaseName ?? "Active phase"}</span>
            <span className="mx-1.5 text-[var(--border)]">·</span>
            {phaseStart} → {phaseEnd}
          </p>
          {selectedOutsidePhase && (
            <span className="font-mono text-[10px] text-[var(--accent-amber)]/80">
              {selectedDate < today
                ? "Outside current phase"
                : "Outside current phase · planning unavailable"}
            </span>
          )}
        </div>
      )}

      <div className="overflow-visible rounded-md p-[6px]">
        <div className="mb-1 grid grid-cols-7 gap-[6px]">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="text-center font-mono text-[10px] text-[var(--text-muted)]"
            >
              {d}
            </div>
          ))}
        </div>

        <div
          ref={dayGridRef}
          className="relative grid grid-cols-7 gap-[6px] overflow-visible [--calendar-cell-gap:6px]"
          style={{ background: "transparent" }}
        >
          {hasPhase && showPhaseOutline && (
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
          const disabled =
            outOfObjective || (disableFutureDays && key > today);
          const isSelected = key === selectedDate;
          const isToday = key === today;
          const presentation = getCalendarDayPresentation(key, today, {
            outOfObjective,
            completedWeight: effortHeat
              ? (stat.rhythmEffectiveMinutes ?? 0) / 60
              : (stat.totalWeight ?? 0),
            plannedWeight: stat.plannedTotalWeight ?? 0,
            completedSlices: stat.completedSubjectBreakdown ?? [],
            plannedSlices: stat.plannedSubjectBreakdown ?? [],
            ...completedWeightBounds,
          });

          const dropEnabled =
            planDayDropTargets && !disabled && (canReceivePlanDrop?.(key) ?? true);
          const dropHighlighted =
            planDayDropTargets && dropEnabled && planDropHighlightDate === key;

          const hasBottomStripe =
            Boolean(presentation.bottomStripe) &&
            presentation.bottomStripeWidthFrac > 0;
          const rhythmDurationBottom = hasBottomStripe ? "bottom-[9px]" : "bottom-[5px]";
          const showEffortDuration =
            isRhythmCalendar &&
            effortHeat &&
            (stat.rhythmEffectiveMinutes ?? 0) > 0 &&
            !disabled;
          const showCoverageWeights = isRhythmCalendar && !effortHeat && !disabled;

          const dayButton = (
            <button
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onSelect(key)}
              onMouseEnter={(e) => {
                if (disabled) return;
                setHoverDate(key);
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
              }}
              onMouseLeave={() => {
                setHoverDate(null);
                setTooltipPos(null);
              }}
              className={cn(
                "relative isolate flex aspect-[1/1] h-full w-full min-h-[2.125rem] items-center justify-center overflow-hidden rounded-[4px] font-mono text-[11px] leading-none transition-[box-shadow,filter]",
                !inMonth && "opacity-30",
                disabled && "cursor-not-allowed opacity-15",
                !disabled &&
                  !isSelected &&
                  "hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)]",
                isSelected &&
                  "z-[2] shadow-[0_0_0_2px_var(--calendar-selection-ring)]",
                dropHighlighted &&
                  "z-[3] shadow-[0_0_0_2px_var(--accent-green)]",
              )}
            >
              {!disabled && (
                <span
                  className="pointer-events-none absolute inset-0 rounded-[4px]"
                  style={{ backgroundColor: presentation.background }}
                  aria-hidden
                />
              )}
              {presentation.topStripe && presentation.topStripeWidthFrac > 0 && (
                <span
                  className="pointer-events-none absolute left-0 top-0 z-[1] h-1 rounded-tl-[3px] opacity-90"
                  style={{
                    background: presentation.topStripe,
                    width: `${presentation.topStripeWidthFrac * 100}%`,
                  }}
                />
              )}
              {presentation.bottomStripe && presentation.bottomStripeWidthFrac > 0 && (
                <span
                  className="pointer-events-none absolute bottom-0 left-0 z-[1] h-1 rounded-bl-[3px] opacity-90"
                  style={{
                    background: presentation.bottomStripe,
                    width: `${presentation.bottomStripeWidthFrac * 100}%`,
                  }}
                />
              )}
              <span
                className={cn(
                  "relative z-[2]",
                  isToday && !disabled
                    ? "font-semibold text-[var(--accent)]"
                    : inMonth
                      ? "text-[var(--text)]"
                      : "text-[var(--text-muted)]",
                )}
              >
                {format(cellDate, "d")}
              </span>
              {(!isRhythmCalendar || showCoverageWeights) &&
                presentation.topWeightLabel != null && (
                <span
                  className="absolute right-0.5 top-[7px] z-[2] font-mono text-[8px] font-semibold leading-none text-[var(--text)]"
                  style={{ textShadow: "0 0 4px var(--bg-elevated)" }}
                >
                  {formatWeightDisplay(presentation.topWeightLabel)}
                </span>
              )}
              {showEffortDuration && (
                <span
                  className={cn(
                    "absolute left-0 right-0 z-[2] text-center font-mono text-[7px] font-semibold leading-tight text-[var(--text)]",
                    rhythmDurationBottom,
                  )}
                  style={{ textShadow: "0 0 4px var(--bg-elevated)" }}
                >
                  {formatRhythmDurationCompact(stat.rhythmEffectiveMinutes ?? 0)}
                </span>
              )}
              {(!isRhythmCalendar || showCoverageWeights) &&
                !showEffortDuration &&
                presentation.bottomWeightLabel != null && (
                  <span
                    className="absolute bottom-[7px] right-0.5 z-[2] font-mono text-[8px] font-semibold leading-none text-[var(--text)]"
                    style={{ textShadow: "0 0 4px var(--bg-elevated)" }}
                  >
                    {formatWeightDisplay(presentation.bottomWeightLabel)}
                  </span>
                )}
            </button>
          );

          return (
            <div
              key={key}
              data-calendar-day
              className="relative min-h-[2.125rem] overflow-visible"
            >
              {planDayDropTargets ? (
                <DroppableCalendarDay
                  date={key}
                  enabled={dropEnabled}
                  highlighted={dropHighlighted}
                >
                  {dayButton}
                </DroppableCalendarDay>
              ) : (
                dayButton
              )}
            </div>
          );
        })}
        </div>
      </div>

      <p className="mt-2 font-mono text-[9px] text-[var(--text-muted)]">
        Click a day for the full log · hover for counts
        {planDayDropTargets && " · drag topic cards here to reschedule"}
      </p>

      {hoverDate && tooltipPos && hoverStat && (
          <div
            className="pointer-events-none fixed z-[100] max-w-[280px] -translate-x-1/2 -translate-y-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 shadow-lg"
            style={{ left: tooltipPos.x, top: tooltipPos.y - 8 }}
          >
            <p className="font-mono text-[10px] text-[var(--text-muted)]">
              {format(parseISO(hoverDate), "d MMM yyyy")}
            </p>
            {(hoverStat.rhythmEffectiveMinutes ?? 0) > 0 && (
              <div className="mt-1 border-b border-[var(--border)] pb-2 text-xs">
                <p className="font-medium text-[var(--accent)]">
                  {formatRhythmDuration(hoverStat.rhythmEffectiveMinutes ?? 0)} effective study
                </p>
                {(hoverStat.rhythmStartTime || hoverStat.rhythmEndTime) && (
                  <p className="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                    {[hoverStat.rhythmStartTime, hoverStat.rhythmEndTime]
                      .filter(Boolean)
                      .join(" → ")}
                    {hoverStat.rhythmBreakMinutes != null &&
                      hoverStat.rhythmBreakMinutes > 0 &&
                      ` · ${heatViewToggle ? formatRhythmDuration(hoverStat.rhythmBreakMinutes) : `${Math.round(hoverStat.rhythmBreakMinutes)}m`} break`}
                  </p>
                )}
              </div>
            )}
            {(() => {
              const cov = coverageDays?.[hoverDate] ?? hoverStat;
              const tw = cov?.totalWeight ?? 0;
              const pw = cov?.plannedTotalWeight ?? 0;
              if (tw <= 0 && pw <= 0) {
                if ((hoverStat.rhythmEffectiveMinutes ?? 0) <= 0) {
                  return (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">No activity</p>
                  );
                }
                return null;
              }
              return (
              <>
                {tw > 0 && (
                  <p className="mt-1 text-xs">
                    {formatWeightDisplay(tw)} wt completed
                    {cov?.isProjection && (
                      <span className="text-[var(--accent-amber)]"> · projected</span>
                    )}
                  </p>
                )}
                {pw > 0 && (
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {formatWeightDisplay(pw)} wt planned
                  </p>
                )}
                {cov?.previews && cov.previews.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-[10px] text-[var(--text-muted)]">
                    {cov.previews.map((p) => (
                      <li key={p} className="truncate">{p}</li>
                    ))}
                  </ul>
                )}
              </>
              );
            })()}
            {(() => {
              const cov = coverageDays?.[hoverDate] ?? hoverStat;
              const completed = cov?.completedSubjectBreakdown ?? [];
              const planned = cov?.plannedSubjectBreakdown ?? [];
              return (
                <>
                  {completed.length > 0 && (
                    <ul className="mt-2 space-y-0.5 border-t border-[var(--border)] pt-2 text-[10px]">
                      <li className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
                        Completed
                      </li>
                      {completed.map((s) => (
                        <li
                          key={s.subjectId}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ background: s.color }}
                            />
                            {s.name}
                          </span>
                          <span className="font-mono text-[var(--text-muted)]">
                            {s.weight} wt
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {planned.length > 0 && (
                    <ul className="mt-2 space-y-0.5 border-t border-[var(--border)] pt-2 text-[10px]">
                      <li className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
                        Planned
                      </li>
                      {planned.map((s) => (
                        <li
                          key={`p-${s.subjectId}`}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ background: s.color }}
                            />
                            {s.name}
                          </span>
                          <span className="font-mono text-[var(--text-muted)]">
                            {s.weight} wt
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              );
            })()}
          </div>
        )}
    </div>
  );
}
