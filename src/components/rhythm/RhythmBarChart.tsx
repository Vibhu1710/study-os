"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  formatRhythmDuration,
  formatRhythmDurationCompact,
  formatTime12,
  parseTimeToMinutes,
  rhythmBreakMinutes,
  rhythmEffectiveMinutes,
} from "@/lib/rhythm/effective-minutes";

export type RhythmChartDay = {
  date: string;
  startMinutes: number | null;
  endMinutes: number | null;
  effectiveMinutes: number | null;
  breakMinutes: number | null;
};

type Metric = "start" | "duration" | "end" | "break";

const tabs: { id: Metric; label: string }[] = [
  { id: "duration", label: "Duration" },
  { id: "start", label: "Clock in" },
  { id: "end", label: "Clock out" },
  { id: "break", label: "Break" },
];

const LOGO_BLUE = "#58a6ff";
const LOGGED_BLUE_GRADIENT = "url(#rhythm-logged-blue)";
const BREAK_GREY_GRADIENT = "url(#rhythm-break-grey)";
/** Default 0–8h y-axis for duration and break; scales up only when a log exceeds 8h. */
const MINUTES_CHART_Y_MAX = 8 * 60;
const DANGER_ZONE_FILL = "url(#rhythm-danger-zone)";
/** Start after noon is late. */
const START_LATE_AFTER_MINUTES = 12 * 60;
/** End at 8:00 PM or later is late. */
const END_LATE_FROM_MINUTES = 20 * 60;
const WINDOW = 12;
const CHART_H = 372;
const PAD = { top: 8, right: 8, bottom: 36 };
/** X-axis date labels — kept above the viewBox bottom for breathing room. */
const X_DATE_LABEL_Y = CHART_H - 18;
const X_DATE_UNDERLINE_Y = CHART_H - 8;
const PLOT_W = 520;

function yAxisPadLeft(
  isTime: boolean,
  yMax: number,
  yMin = 0,
): number {
  if (isTime) {
    let maxLen = 4;
    for (const mins of hourTickMinutes(yMin, yMax)) {
      maxLen = Math.max(maxLen, formatAxisHour(mins).length);
    }
    return Math.max(40, Math.round(maxLen * 6.2) + 12);
  }
  let maxLen = 2;
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const val = Math.round(yMax * t * 10) / 10;
    maxLen = Math.max(maxLen, formatRhythmDurationCompact(val).length);
  }
  return Math.max(48, Math.round(maxLen * 6.2) + 12);
}

function isBarMetric(_metric: Metric): boolean {
  return true;
}

function legendLabelForMetric(metric: Metric): string {
  if (metric === "break") return "Break (derived)";
  if (metric === "duration") return "Effective study";
  if (metric === "start") return "Clock-in time";
  return "Clock-out time";
}

function lateThresholdForMetric(metric: Metric): number | null {
  if (metric === "start") return START_LATE_AFTER_MINUTES;
  if (metric === "end") return END_LATE_FROM_MINUTES;
  return null;
}

function lateEntryNote(metric: Metric, minutes: number): string | null {
  if (metric === "start" && minutes > START_LATE_AFTER_MINUTES) {
    return "Late clock-in (after 12:00 PM)";
  }
  if (metric === "end" && minutes >= END_LATE_FROM_MINUTES) {
    return "Late clock-out (8:00 PM or later)";
  }
  return null;
}

function timeChartBounds(
  visible: DayRow[],
  today: string,
  metric: "start" | "end",
  byDate: Map<string, RhythmChartDay>,
): { yMin: number; yMax: number } {
  const threshold = lateThresholdForMetric(metric)!;
  let minV = metric === "start" ? 8 * 60 : 16 * 60;
  let maxV = metric === "start" ? 15 * 60 : 22 * 60;
  for (const d of visible) {
    if (d.date > today) continue;
    const raw = byDate.get(d.date);
    if (!raw || !hasLog(raw, metric)) continue;
    const v = metricValue(raw, metric);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  minV = Math.min(minV, threshold - 75);
  maxV = Math.max(maxV, threshold + 75);
  const span = Math.max(maxV - minV, 90);
  const pad = span * 0.06;
  return { yMin: minV - pad, yMax: maxV + pad };
}

function formatLabel(date: string) {
  return date.slice(5);
}

function formatAxisHour(mins: number): string {
  const h24 = Math.floor(mins / 60) % 24;
  const am = h24 < 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12} ${am ? "AM" : "PM"}`;
}

function hourTickMinutes(yMin: number, yMax: number): number[] {
  const startH = Math.ceil(yMin / 60);
  const endH = Math.floor(yMax / 60);
  const out: number[] = [];
  for (let h = startH; h <= endH; h++) out.push(h * 60);
  if (out.length === 0) {
    out.push(Math.round((yMin + yMax) / 2 / 60) * 60);
  }
  return out;
}

function peakMinutesInWindow(
  visible: DayRow[],
  today: string,
  byDate: Map<string, RhythmChartDay>,
  metric: "duration" | "break",
): number {
  let peak = 0;
  for (const d of visible) {
    if (d.date > today) continue;
    const raw = byDate.get(d.date);
    if (!raw || !hasLog(raw, metric)) continue;
    peak = Math.max(peak, metricValue(raw, metric));
  }
  return peak;
}

function fixedOrFlexibleMinutesYMax(
  visible: DayRow[],
  today: string,
  byDate: Map<string, RhythmChartDay>,
  metric: "duration" | "break",
): number {
  const peak = peakMinutesInWindow(visible, today, byDate, metric);
  if (peak > MINUTES_CHART_Y_MAX) return peak * 1.08;
  return MINUTES_CHART_Y_MAX;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function ChartDateNavButton({
  disabled,
  title,
  ariaLabel,
  onClick,
  children,
}: {
  disabled: boolean;
  title?: string;
  ariaLabel: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex" title={title}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={onClick}
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-visible rounded-md border transition-colors",
          disabled
            ? "cursor-not-allowed border-transparent bg-transparent text-[color-mix(in_srgb,var(--border)_70%,transparent)] opacity-45 shadow-none"
            : "btn !p-0 border-[var(--border)] bg-[var(--bg-muted)] text-[color-mix(in_srgb,var(--text-muted)_88%,var(--text))]",
        )}
      >
        {children}
      </button>
    </span>
  );
}

type DayRow = {
  date: string;
  label: string;
  completed: number;
  planned: number;
};

function metricValue(day: RhythmChartDay | undefined, metric: Metric): number {
  if (!day) return 0;
  if (metric === "start") return day.startMinutes ?? 0;
  if (metric === "end") return day.endMinutes ?? 0;
  if (metric === "duration") return day.effectiveMinutes ?? 0;
  return day.breakMinutes ?? 0;
}

function hasLog(day: RhythmChartDay | undefined, metric: Metric): boolean {
  if (!day) return false;
  if (metric === "start") return day.startMinutes != null;
  if (metric === "end") return day.endMinutes != null;
  if (metric === "duration") return day.effectiveMinutes != null;
  return day.breakMinutes != null;
}

function minutesToHhmm(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = Math.round(mins % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function formatTooltipValue(day: RhythmChartDay, metric: Metric): string {
  if (metric === "start" && day.startMinutes != null)
    return formatTime12(minutesToHhmm(day.startMinutes));
  if (metric === "end" && day.endMinutes != null)
    return formatTime12(minutesToHhmm(day.endMinutes));
  if (metric === "duration" && day.effectiveMinutes != null)
    return formatRhythmDuration(day.effectiveMinutes);
  if (metric === "break" && day.breakMinutes != null)
    return formatRhythmDuration(day.breakMinutes);
  return "—";
}

function metricLabel(metric: Metric): string {
  return tabs.find((t) => t.id === metric)?.label ?? metric;
}

/** Normalized bar height 0–1 within the current y-axis window. */
function barHeightRatio(
  metric: Metric,
  value: number,
  yMax: number,
  yMin: number,
): number {
  if (metric === "start" || metric === "end") {
    const span = yMax - yMin;
    if (span <= 0) return 0;
    return Math.min(1, Math.max(0, (value - yMin) / span));
  }
  if (yMax <= 0) return 0;
  return Math.min(1, Math.max(0, value / yMax));
}

/**
 * Duration & break: taller bars read stronger (good / loud undesired).
 * Clock in/out: taller bars (later times) read softer.
 */
function barFillOpacity(
  metric: Metric,
  value: number,
  yMax: number,
  yMin: number,
): number {
  const t = barHeightRatio(metric, value, yMax, yMin);
  if (metric === "duration") {
    return 0.38 + t * 0.62;
  }
  if (metric === "break") {
    return 0.28 + t * 0.72;
  }
  if (metric === "start" || metric === "end") {
    return 0.32 + (1 - t) * 0.68;
  }
  return 1;
}

export function RhythmBarChart({
  days,
  objectiveStart,
  objectiveEnd,
  today,
  selectedDay,
  onSelectDay,
}: {
  days: RhythmChartDay[];
  objectiveStart: string;
  objectiveEnd: string;
  today: string;
  selectedDay?: string | null;
  onSelectDay?: (date: string) => void;
}) {
  const [metric, setMetric] = useState<Metric>("duration");
  const [barTooltip, setBarTooltip] = useState<{
    date: string;
    label: string;
    value: string;
    lateNote: string | null;
    x: number;
    y: number;
  } | null>(null);
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  const rows: DayRow[] = useMemo(() => {
    const out: DayRow[] = [];
    for (let d = objectiveStart; d <= objectiveEnd; d = nextDay(d)) {
      const raw = byDate.get(d);
      const logged = hasLog(raw, metric);
      out.push({
        date: d,
        label: formatLabel(d),
        completed: logged ? metricValue(raw, metric) : 0,
        planned: 0,
      });
    }
    return out;
  }, [byDate, objectiveStart, objectiveEnd, metric]);

  const [startIdx, setStartIdx] = useState(0);

  useEffect(() => {
    const todayIdx = rows.findIndex((d) => d.date === today);
    if (todayIdx >= 0) {
      setStartIdx(
        Math.max(
          0,
          Math.min(
            todayIdx - Math.floor(WINDOW / 2),
            Math.max(0, rows.length - WINDOW),
          ),
        ),
      );
    }
  }, [rows, today]);

  const maxStart = Math.max(0, rows.length - WINDOW);
  const visible = rows.slice(startIdx, startIdx + WINDOW);
  const plotH = CHART_H - PAD.top - PAD.bottom;
  const slotW = visible.length > 0 ? PLOT_W / visible.length : PLOT_W;
  const barW = Math.min(28, slotW * 0.55);
  const isTime = metric === "start" || metric === "end";
  const isBar = isBarMetric(metric);
  const lateThreshold = lateThresholdForMetric(metric);

  const timeBounds = useMemo(() => {
    if (!isTime) return null;
    return timeChartBounds(visible, today, metric, byDate);
  }, [visible, today, metric, isTime, byDate]);

  const yMax = useMemo(() => {
    if (isTime && timeBounds) return timeBounds.yMax;
    if (metric === "duration") {
      return fixedOrFlexibleMinutesYMax(visible, today, byDate, "duration");
    }
    if (metric === "break") {
      return fixedOrFlexibleMinutesYMax(visible, today, byDate, "break");
    }
    return MINUTES_CHART_Y_MAX;
  }, [visible, today, isTime, timeBounds, metric, byDate]);

  const yMin = isTime && timeBounds ? timeBounds.yMin : 0;

  const padLeft = useMemo(
    () => yAxisPadLeft(isTime, yMax, yMin),
    [isTime, yMax, yMin],
  );

  function yScale(v: number) {
    if (isTime) {
      const span = yMax - yMin;
      if (span <= 0) return PAD.top + plotH;
      return PAD.top + plotH - ((v - yMin) / span) * plotH;
    }
    return PAD.top + plotH - (v / yMax) * plotH;
  }

  const yGridLines = useMemo(() => {
    if (isTime) {
      return hourTickMinutes(yMin, yMax).map((mins) => ({
        key: `h-${mins}`,
        y: yScale(mins),
        label: formatAxisHour(mins),
      }));
    }
    return [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      key: `f-${t}`,
      y: PAD.top + plotH * (1 - t),
      label: formatRhythmDurationCompact(Math.round(yMax * t * 10) / 10),
    }));
  }, [isTime, yMin, yMax, plotH]);

  const barBaseline = isTime ? yMin : 0;

  function shift(delta: number) {
    setStartIdx((i) => Math.max(0, Math.min(maxStart, i + delta)));
  }

  function cxForIndex(i: number) {
    return padLeft + slotW * i + slotW / 2;
  }

  const rangeStart = rows[0]?.date;
  const rangeEnd = rows[rows.length - 1]?.date;
  const atStart = startIdx <= 0;
  const atEnd = startIdx >= maxStart;

  const dangerZoneTop = PAD.top;
  const dangerLineY =
    isTime && lateThreshold != null ? yScale(lateThreshold) : null;
  const dangerZoneHeight =
    dangerLineY != null ? Math.max(0, dangerLineY - dangerZoneTop) : 0;

  return (
    <div className="card flex h-full min-h-[22rem] flex-col p-4">
      <h2 className="mb-3 font-mono text-sm text-[var(--text-muted)]">Daily momentum</h2>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-2.5 py-2 font-mono text-[9px] leading-snug text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-block shrink-0",
                "h-2.5 w-2 rounded-sm",
              )}
              style={
                metric === "break"
                  ? {
                      background:
                        "linear-gradient(to bottom, color-mix(in srgb, var(--text-muted) 34%, transparent), color-mix(in srgb, var(--text-muted) 2%, transparent))",
                    }
                  : { background: LOGO_BLUE }
              }
              aria-hidden
            />
            <span>{legendLabelForMetric(metric)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="inline-flex rounded-md border border-[var(--border)] p-0.5 font-mono text-[10px]">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={cn(
                  "rounded px-2.5 py-1 transition-colors",
                  metric === t.id
                    ? "bg-[var(--bg-muted)] text-[var(--text)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
                onClick={() => setMetric(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <ChartDateNavButton
            disabled={atStart}
            title={atStart && rangeStart ? `At start (${rangeStart})` : undefined}
            ariaLabel="Earlier dates"
            onClick={() => shift(-4)}
          >
            <ChevronLeft size={28} strokeWidth={1.25} absoluteStrokeWidth aria-hidden />
          </ChartDateNavButton>
          <ChartDateNavButton
            disabled={atEnd}
            title={atEnd && rangeEnd ? `At end (${rangeEnd})` : undefined}
            ariaLabel="Later dates"
            onClick={() => shift(4)}
          >
            <ChevronRight size={28} strokeWidth={1.25} absoluteStrokeWidth aria-hidden />
          </ChartDateNavButton>
        </div>
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col overflow-x-auto pb-2">
        <svg
          viewBox={`0 0 ${PLOT_W + padLeft + PAD.right} ${CHART_H}`}
          className="h-full min-h-[17.5rem] w-full max-w-full flex-1 overflow-visible"
          preserveAspectRatio="xMidYMax meet"
          role="img"
          aria-label="Daily momentum chart"
        >
          <defs>
            <linearGradient
              id="rhythm-logged-blue"
              gradientUnits="objectBoundingBox"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#9cd1ff" stopOpacity={1} />
              <stop offset="38%" stopColor={LOGO_BLUE} stopOpacity={1} />
              <stop offset="100%" stopColor="#3d8bfd" stopOpacity={1} />
            </linearGradient>
            <linearGradient
              id="rhythm-break-grey"
              gradientUnits="objectBoundingBox"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="var(--text-muted)" stopOpacity={0.34} />
              <stop offset="50%" stopColor="var(--text-muted)" stopOpacity={0.14} />
              <stop offset="100%" stopColor="var(--text-muted)" stopOpacity={0.02} />
            </linearGradient>
            {isTime && dangerZoneHeight > 0 && dangerLineY != null && (
              <linearGradient
                id="rhythm-danger-zone"
                gradientUnits="userSpaceOnUse"
                x1={padLeft}
                y1={dangerLineY}
                x2={padLeft}
                y2={dangerZoneTop}
              >
                <stop offset="0%" stopColor="var(--text-muted)" stopOpacity={0.16} />
                <stop offset="40%" stopColor="var(--text-muted)" stopOpacity={0.07} />
                <stop offset="100%" stopColor="var(--text-muted)" stopOpacity={0} />
              </linearGradient>
            )}
          </defs>

          {isTime && dangerZoneHeight > 0 && (
            <rect
              x={padLeft}
              y={dangerZoneTop}
              width={PLOT_W}
              height={dangerZoneHeight}
              fill={DANGER_ZONE_FILL}
              aria-hidden
            />
          )}

          {yGridLines.map(({ key, y, label }) => (
              <g key={key}>
                <line
                  x1={padLeft}
                  x2={padLeft + PLOT_W}
                  y1={y}
                  y2={y}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                  opacity={0.6}
                />
                <text
                  x={padLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  fill="var(--text-muted)"
                  fontSize={9}
                  fontFamily="ui-monospace, monospace"
                >
                  {label}
                </text>
              </g>
            ))}

          {isBar &&
            visible.map((d, i) => {
            const cx = cxForIndex(i);
            const isPast = d.date < today;
            const isToday = d.date === today;
            const raw = byDate.get(d.date);
            const logged =
              (isPast || isToday) && raw && hasLog(raw, metric);
            const value = logged ? metricValue(raw, metric) : 0;
            const barTop = yScale(value);
            const barBottom = yScale(barBaseline);
            const fullH = Math.max(0, barBottom - barTop);
            const lateNote =
              isTime && logged ? lateEntryNote(metric, value) : null;

            const showBar = logged && (isTime ? true : value > 0);

            function showTooltip(e: MouseEvent) {
              if (!showBar || !raw) return;
              const box = (e.currentTarget as SVGElement).getBoundingClientRect();
              setBarTooltip({
                date: d.date,
                label: metricLabel(metric),
                value: formatTooltipValue(raw, metric),
                lateNote,
                x: box.left + box.width / 2,
                y: box.top,
              });
            }

            const barFill =
              metric === "break" ? BREAK_GREY_GRADIENT : LOGGED_BLUE_GRADIENT;
            const barOpacity =
              showBar && logged
                ? barFillOpacity(metric, value, yMax, yMin)
                : 1;

            return (
              <g
                key={d.date}
                className={onSelectDay ? "cursor-pointer" : undefined}
                onClick={() => {
                  if (onSelectDay && d.date <= today) onSelectDay(d.date);
                }}
              >
                {showBar && (
                  <rect
                    x={cx - barW / 2}
                    y={barTop}
                    width={barW}
                    height={fullH}
                    rx={metric === "break" ? 2 : 3}
                    fill={barFill}
                    fillOpacity={barOpacity}
                    onMouseEnter={showTooltip}
                    onMouseMove={showTooltip}
                    onMouseLeave={() => setBarTooltip(null)}
                  />
                )}

                {(isPast || isToday) && !showBar && (
                  <line
                    x1={cx - barW / 4}
                    x2={cx + barW / 4}
                    y1={barBottom}
                    y2={barBottom}
                    stroke="var(--border)"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                )}
              </g>
            );
          })}

          {visible.map((d, i) => {
            const cx = cxForIndex(i);
            const isToday = d.date === today;
            const isSelected = selectedDay != null && d.date === selectedDay;
            return (
              <g
                key={`x-${d.date}`}
                className={onSelectDay && d.date <= today ? "cursor-pointer" : undefined}
                onClick={() => {
                  if (onSelectDay && d.date <= today) onSelectDay(d.date);
                }}
              >
                <text
                  x={cx}
                  y={X_DATE_LABEL_Y}
                  textAnchor="middle"
                  fill={
                    isSelected
                      ? "var(--text)"
                      : isToday
                        ? LOGO_BLUE
                        : "var(--text-muted)"
                  }
                  fontSize={9}
                  fontFamily="ui-monospace, monospace"
                  fontWeight={isSelected || isToday ? 600 : 400}
                >
                  {d.label}
                </text>
                {isSelected ? (
                  <rect
                    x={cx - 10}
                    y={X_DATE_UNDERLINE_Y}
                    width={20}
                    height={2}
                    rx={1}
                    fill={LOGO_BLUE}
                  />
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      {barTooltip && (
        <div
          className="pointer-events-none fixed z-[200] max-w-[240px] -translate-x-1/2 -translate-y-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 shadow-lg"
          style={{ left: barTooltip.x, top: barTooltip.y - 8 }}
        >
          <p className="font-mono text-[10px] text-[var(--text-muted)]">{barTooltip.date}</p>
          <p className="mt-0.5 text-xs font-medium text-[var(--text)]">{barTooltip.label}</p>
          <p className="mt-1 font-mono text-sm text-[var(--accent)]">{barTooltip.value}</p>
          {barTooltip.lateNote && (
            <p className="mt-1.5 font-mono text-[10px] text-[var(--text-muted)]">
              {barTooltip.lateNote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function sessionsToChartDays(
  sessions: {
    date: string;
    startTime: string;
    endTime: string;
    startTimeConfirmed?: boolean;
    endTimeConfirmed?: boolean;
    startsWithOddCycle: boolean;
    fullCycleCount: number;
    startPartialTenths: number;
    endPartialTenths: number;
  }[],
  cfg: { oddMinutes: number; evenMinutes: number },
): RhythmChartDay[] {
  return sessions.map((s) => {
    const effective = rhythmEffectiveMinutes(s, cfg);
    const startOk = s.startTimeConfirmed ?? false;
    const endOk = s.endTimeConfirmed ?? false;
    return {
      date: s.date,
      startMinutes: startOk ? parseTimeToMinutes(s.startTime) : null,
      endMinutes: endOk ? parseTimeToMinutes(s.endTime) : null,
      effectiveMinutes: effective > 0 ? effective : null,
      breakMinutes:
        startOk && endOk ? rhythmBreakMinutes(s, cfg) : null,
    };
  });
}
