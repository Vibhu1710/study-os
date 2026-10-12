"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { PhaseDayPoint } from "@/lib/actions/phase-dashboard";
import { cn } from "@/lib/cn";

const LOGO_BLUE = "#58a6ff";
/** Soft gray required line — readable but not bright white on dark UI. */
const PACE_REQUIRED_GRAY = "#9aa3af";

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
/** Lighter highlight → logo blue → slightly deeper blue at the base (stays opaque). */
const LOGGED_BLUE_GRADIENT = "url(#logged-blue)";
const WINDOW = 12;
const CHART_H = 220;
const PAD = { top: 8, right: 8, bottom: 28, left: 36 };

function formatLabel(date: string) {
  return date.slice(5);
}

/** "10-03" at 9px monospace, plus a small gap so neighbors do not touch. */
const X_LABEL_WIDTH = 34;

function xAxisLabelIndices(
  count: number,
  plotWidth: number,
  priority: number[],
): Set<number> {
  if (count <= 0) return new Set();
  const slot = plotWidth / count;
  const minGap = Math.max(1, Math.ceil(X_LABEL_WIDTH / slot));
  const chosen: number[] = [];
  function canAdd(index: number) {
    return chosen.every((kept) => Math.abs(kept - index) >= minGap);
  }
  const candidates = [
    ...priority,
    0,
    count - 1,
    ...Array.from({ length: count }, (_, index) => index).filter(
      (index) => index % minGap === 0,
    ),
  ];
  for (const index of candidates) {
    if (index < 0 || index >= count || chosen.includes(index)) continue;
    if (canAdd(index)) chosen.push(index);
  }
  return new Set(chosen);
}

type DayRow = PhaseDayPoint & { label: string };
export type ChartMode = "weight" | "speed";

type ChartPacePoint = {
  x: number;
  y: number;
  date: string;
  value: number;
  hoverTitle: string;
};

function linePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
}

function diamondPolygon(cx: number, cy: number, r: number): string {
  return `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
}

function PaceSeriesLayer({
  points,
  stroke,
  strokeWidth = 1.75,
  markerFill,
  markerStroke,
  onSelectDate,
}: {
  points: ChartPacePoint[];
  stroke: string;
  strokeWidth?: number;
  markerFill: string;
  markerStroke: string;
  onSelectDate?: (date: string) => void;
}) {
  if (points.length === 0) return null;
  const r = 4;
  return (
    <g className="pace-series">
      <path
        d={linePath(points)}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />
      {points.map((p) => (
        <g
          key={p.date}
          className={onSelectDate ? "cursor-pointer" : undefined}
          onClick={
            onSelectDate
              ? (e) => {
                  e.stopPropagation();
                  onSelectDate(p.date);
                }
              : undefined
          }
        >
          <polygon
            points={diamondPolygon(p.x, p.y, r)}
            fill={markerFill}
            stroke={markerStroke}
            strokeWidth={1.25}
            pointerEvents="all"
          >
            <title>{p.hoverTitle}</title>
          </polygon>
        </g>
      ))}
    </g>
  );
}

function ChartLegendBox({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-2.5 py-2 font-mono text-[9px] leading-snug text-[var(--text-muted)]">
      {children}
    </div>
  );
}

function WeightChartLegend() {
  return (
    <ChartLegendBox>
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#58a6ff]"
          aria-hidden
        />
        <span>Completed</span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--text-muted)_40%,transparent)]"
          aria-hidden
        />
        <span>Planned</span>
      </div>
    </ChartLegendBox>
  );
}

function SpeedChartLegend() {
  return (
    <ChartLegendBox>
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#58a6ff]"
          aria-hidden
        />
        <span>5-day avg</span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: PACE_REQUIRED_GRAY }}
          aria-hidden
        />
        <span>Required</span>
      </div>
    </ChartLegendBox>
  );
}

export function PhaseWeightDayChart({
  days,
  today,
  tomorrow,
  requiredFromTomorrow,
  mode,
  onModeChange,
  selectedDay,
  onSelectDay,
  windowSize = WINDOW,
}: {
  days: PhaseDayPoint[];
  today: string;
  tomorrow: string | null;
  requiredFromTomorrow: number | null;
  mode: ChartMode;
  onModeChange: (mode: ChartMode) => void;
  selectedDay: string | null;
  onSelectDay: (date: string) => void;
  windowSize?: number;
}) {
  const rows: DayRow[] = useMemo(
    () => days.map((d) => ({ ...d, label: formatLabel(d.date) })),
    [days],
  );

  const [startIdx, setStartIdx] = useState(0);

  useEffect(() => {
    const todayIdx = rows.findIndex((d) => d.date === today);
    if (todayIdx >= 0) {
      setStartIdx(
        Math.max(
          0,
          Math.min(
            todayIdx - Math.floor(windowSize / 2),
            Math.max(0, rows.length - windowSize),
          ),
        ),
      );
    }
  }, [rows, today, windowSize]);

  const maxStart = Math.max(0, rows.length - windowSize);
  const visible = rows.slice(startIdx, startIdx + windowSize);
  const plotW = 640;
  const labeledIndices = useMemo(() => {
    const todayIdx = visible.findIndex((d) => d.date === today);
    const selectedIdx =
      selectedDay != null ? visible.findIndex((d) => d.date === selectedDay) : -1;
    return xAxisLabelIndices(visible.length, plotW, [todayIdx, selectedIdx]);
  }, [visible, today, selectedDay]);

  const plotH = CHART_H - PAD.top - PAD.bottom;
  const slotW = visible.length > 0 ? plotW / visible.length : plotW;
  const barW = Math.min(28, slotW * 0.55);

  const yMaxWeight = useMemo(() => {
    let m = 1;
    for (const d of visible) {
      const isTodayRow = d.date === today;
      const dayWt = isTodayRow ? d.completed + d.planned : d.planned;
      m = Math.max(m, dayWt, d.completed);
    }
    return m * 1.08;
  }, [visible, today]);

  const yMaxSpeed = useMemo(() => {
    let m = 1;
    for (const d of visible) {
      m = Math.max(m, d.rolling5DayAvg ?? 0, d.requiredAsOfDay ?? 0);
    }
    if (
      tomorrow &&
      requiredFromTomorrow != null &&
      visible.some((d) => d.date === tomorrow)
    ) {
      m = Math.max(m, requiredFromTomorrow);
    }
    return m * 1.08;
  }, [visible, tomorrow, requiredFromTomorrow]);

  const yMax = mode === "weight" ? yMaxWeight : yMaxSpeed;

  function yScale(v: number) {
    return PAD.top + plotH - (v / yMax) * plotH;
  }

  function shift(delta: number) {
    setStartIdx((i) => Math.max(0, Math.min(maxStart, i + delta)));
  }

  function cxForIndex(i: number) {
    return PAD.left + slotW * i + slotW / 2;
  }

  const rollingPoints = useMemo((): ChartPacePoint[] => {
    const pts: ChartPacePoint[] = [];
    visible.forEach((d, i) => {
      if (d.date > today || d.rolling5DayAvg == null) return;
      const v = d.rolling5DayAvg;
      pts.push({
        x: cxForIndex(i),
        y: yScale(v),
        date: d.date,
        value: v,
        hoverTitle: `${d.date} · 5-day avg ${v} wt/d`,
      });
    });
    return pts;
  }, [visible, today, slotW, yMax]);

  const requiredPoints = useMemo((): ChartPacePoint[] => {
    const pts: ChartPacePoint[] = [];
    visible.forEach((d, i) => {
      if (d.date > today || d.requiredAsOfDay == null) return;
      const v = d.requiredAsOfDay;
      pts.push({
        x: cxForIndex(i),
        y: yScale(v),
        date: d.date,
        value: v,
        hoverTitle: `${d.date} · required ${v} wt/d`,
      });
    });
    if (tomorrow && requiredFromTomorrow != null) {
      const ti = visible.findIndex((d) => d.date === tomorrow);
      if (ti >= 0 && !pts.some((p) => p.date === tomorrow)) {
        pts.push({
          x: cxForIndex(ti),
          y: yScale(requiredFromTomorrow),
          date: tomorrow,
          value: requiredFromTomorrow,
          hoverTitle: `${tomorrow} · need ${requiredFromTomorrow} wt/d from here on`,
        });
      }
    }
    pts.sort((a, b) => a.date.localeCompare(b.date));
    return pts;
  }, [visible, today, tomorrow, requiredFromTomorrow, slotW, yMax]);

  const phaseStart = rows[0]?.date;
  const phaseEnd = rows[rows.length - 1]?.date;
  const atPhaseStart = startIdx <= 0;
  const atPhaseEnd = startIdx >= maxStart;

  const chartTitle =
    mode === "weight" ? "Weight per day" : "Pace per day";
  const chartAriaLabel =
    mode === "weight" ? "Weight per day chart" : "Pace per day chart";

  return (
    <div>
      <h2 className="mb-3 font-mono text-sm text-[var(--text-muted)]">
        {chartTitle}
      </h2>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {mode === "weight" ? <WeightChartLegend /> : <SpeedChartLegend />}
        <div className="flex shrink-0 items-center gap-2">
          <div
            className="flex rounded-md border border-[var(--border)] p-0.5 font-mono text-[10px]"
            role="tablist"
            aria-label="Chart mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "weight"}
              className={cn(
                "rounded px-2.5 py-1 transition-colors",
                mode === "weight"
                  ? "bg-[var(--bg-muted)] text-[var(--text)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
              onClick={() => onModeChange("weight")}
            >
              weight
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "speed"}
              className={cn(
                "rounded px-2.5 py-1 transition-colors",
                mode === "speed"
                  ? "bg-[var(--bg-muted)] text-[var(--text)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
              onClick={() => onModeChange("speed")}
            >
              speed
            </button>
          </div>
          <ChartDateNavButton
            disabled={atPhaseStart}
            title={
              atPhaseStart && phaseStart
                ? `At phase start (${phaseStart})`
                : undefined
            }
            ariaLabel="Earlier dates"
            onClick={() => shift(-4)}
          >
            <ChevronLeft
              size={28}
              strokeWidth={1.25}
              absoluteStrokeWidth
              aria-hidden
            />
          </ChartDateNavButton>
          <ChartDateNavButton
            disabled={atPhaseEnd}
            title={
              atPhaseEnd && phaseEnd ? `At phase end (${phaseEnd})` : undefined
            }
            ariaLabel="Later dates"
            onClick={() => shift(4)}
          >
            <ChevronRight
              size={28}
              strokeWidth={1.25}
              absoluteStrokeWidth
              aria-hidden
            />
          </ChartDateNavButton>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${plotW + PAD.left + PAD.right} ${CHART_H}`}
          className="w-full max-w-full"
          role="img"
          aria-label={chartAriaLabel}
        >
          <defs>
            <linearGradient
              id="logged-blue"
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
            <linearGradient id="planned-future" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--text-muted)" stopOpacity={0.35} />
              <stop offset="55%" stopColor="var(--text-muted)" stopOpacity={0.12} />
              <stop offset="100%" stopColor="var(--bg)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="planned-today-remainder" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--text-muted)" stopOpacity={0.28} />
              <stop offset="70%" stopColor="var(--border)" stopOpacity={0.15} />
              <stop offset="100%" stopColor="var(--bg)" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = PAD.top + plotH * (1 - t);
            const val = Math.round(yMax * t * 10) / 10;
            return (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + plotW}
                  y1={y}
                  y2={y}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                  opacity={0.6}
                />
                <text
                  x={PAD.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="var(--text-muted)"
                  fontSize={9}
                  fontFamily="ui-monospace, monospace"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {visible.map((d, i) => {
            const cx = cxForIndex(i);
            const isPast = d.date < today;
            const isToday = d.date === today;
            const isFuture = d.date > today;
            const planned = d.planned;
            const completed = d.completed;
            /** On today, `planned` is remaining day-plan wt (not full day target). */
            const todayRemaining = isToday ? planned : 0;
            const todayDayTotal = isToday ? completed + todayRemaining : 0;
            const scaleTotal = isToday
              ? Math.max(todayDayTotal, completed)
              : isFuture
                ? planned
                : isPast
                  ? completed
                  : Math.max(planned, completed);
            const barTop = yScale(scaleTotal);
            const barBottom = yScale(0);
            const fullH = Math.max(0, barBottom - barTop);

            const completedH =
              isToday && scaleTotal > 0
                ? fullH * (completed / scaleTotal)
                : isPast && completed > 0
                  ? fullH
                  : 0;
            const todayGhostH =
              isToday && scaleTotal > 0 && todayRemaining > 0
                ? fullH * (todayRemaining / scaleTotal)
                : 0;
            const completedTop = barBottom - completedH;
            const isSelected =
              selectedDay !== null && d.date === selectedDay;
            const paceSelectable =
              mode === "speed" && d.date <= today;

            return (
              <g
                key={d.date}
                className="cursor-pointer"
                onClick={() => {
                  if (mode === "weight") onSelectDay(d.date);
                  else if (paceSelectable) onSelectDay(d.date);
                }}
                style={{ outline: "none" }}
              >
                {mode === "weight" && (
                  <>
                    {isPast && completed > 0 && (
                      <rect
                        x={cx - barW / 2}
                        y={barTop}
                        width={barW}
                        height={fullH}
                        rx={3}
                        fill={LOGGED_BLUE_GRADIENT}
                      />
                    )}

                    {isToday && (todayRemaining > 0 || completed > 0) && (
                      <>
                        {todayGhostH > 0 && (
                          <rect
                            x={cx - barW / 2}
                            y={barTop}
                            width={barW}
                            height={todayGhostH}
                            rx={3}
                            fill="url(#planned-today-remainder)"
                          />
                        )}
                        {completedH > 0 && (
                          <rect
                            x={cx - barW / 2}
                            y={completedTop}
                            width={barW}
                            height={completedH}
                            rx={3}
                            fill={LOGGED_BLUE_GRADIENT}
                          />
                        )}
                      </>
                    )}

                    {isFuture && planned > 0 && (
                      <rect
                        x={cx - barW / 2}
                        y={barTop}
                        width={barW}
                        height={fullH}
                        rx={3}
                        fill="url(#planned-future)"
                      />
                    )}

                    {isPast && completed <= 0 && planned <= 0 && (
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
                  </>
                )}

                {mode === "speed" && (
                  <rect
                    x={cx - slotW / 2}
                    y={PAD.top}
                    width={slotW}
                    height={plotH}
                    fill="transparent"
                  />
                )}

                {labeledIndices.has(i) ? (
                  <text
                    x={cx}
                    y={CHART_H - 8}
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
                ) : null}
                {isSelected ? (
                  <rect
                    x={cx - 10}
                    y={CHART_H - 3}
                    width={20}
                    height={2}
                    rx={1}
                    fill={LOGO_BLUE}
                  />
                ) : null}
              </g>
            );
          })}

          {mode === "speed" && (
            <>
              <PaceSeriesLayer
                points={rollingPoints}
                stroke={LOGO_BLUE}
                markerFill={LOGO_BLUE}
                markerStroke="var(--bg-elevated)"
                onSelectDate={onSelectDay}
              />
              <PaceSeriesLayer
                points={requiredPoints}
                stroke={PACE_REQUIRED_GRAY}
                strokeWidth={1.5}
                markerFill={PACE_REQUIRED_GRAY}
                markerStroke="var(--bg-elevated)"
                onSelectDate={onSelectDay}
              />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
