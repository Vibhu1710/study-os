"use client";

import { useId, useMemo } from "react";
import { cn } from "@/lib/cn";
import { formatRhythmDuration } from "@/lib/rhythm/effective-minutes";
import {
  clampPartialSliderTenth,
  PARTIAL_SLIDER_MAX_TENTHS,
  PARTIAL_SLIDER_MIN_TENTHS,
} from "@/lib/rhythm/entries";

const SAND_TOP = "#c4b5fd";
const SAND_MID = "#a855f7";
const SAND_DEEP = "#7c3aed";

/** When lower fill passes this fraction, the top triangle stops growing. */
const LOWER_TRIANGLE_CAP = 0.38;

function lowerWallX(
  y: number,
  side: "left" | "right",
  pinchY: number,
  lowerBottom: number,
): number {
  const span = lowerBottom - pinchY;
  const t = (lowerBottom - y) / span;
  return side === "left" ? 16 + 16 * t : 48 - 16 * t;
}

function buildLowerSandPaths(level: number, pinchY: number, lowerBottom: number): string[] {
  const L = Math.min(1, Math.max(0, level));
  if (L <= 0.001) return [];

  const span = lowerBottom - pinchY;
  const yTop = lowerBottom - L * span;
  const triHeight = LOWER_TRIANGLE_CAP * span;

  if (L <= LOWER_TRIANGLE_CAP) {
    return [`M 16 ${lowerBottom} L 48 ${lowerBottom} L 32 ${yTop.toFixed(2)} Z`];
  }

  const yTriBase = yTop + triHeight;
  const xBl = lowerWallX(yTriBase, "left", pinchY, lowerBottom);
  const xBr = lowerWallX(yTriBase, "right", pinchY, lowerBottom);

  const triangle = `M 16 ${yTriBase.toFixed(2)} L 48 ${yTriBase.toFixed(2)} L 32 ${yTop.toFixed(2)} Z`;
  const trapezium = `M 16 ${lowerBottom} L 48 ${lowerBottom} L ${xBr.toFixed(2)} ${yTriBase.toFixed(2)} L ${xBl.toFixed(2)} ${yTriBase.toFixed(2)} Z`;

  return [trapezium, triangle];
}

export function RhythmSandglassPartial({
  variant = "start",
  tenths,
  onChange,
  disabled,
  className,
  hideCaption,
  contributedMinutes,
  /** @deprecated use tenths */
  remainingTenths,
}: {
  variant?: "start" | "end";
  tenths: number;
  onChange: (tenths: number) => void;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
  hideCaption?: boolean;
  /** Effective minutes this partial adds (shown beside % caption). */
  contributedMinutes?: number;
  remainingTenths?: number;
}) {
  const uid = useId().replace(/:/g, "");
  const raw = tenths ?? remainingTenths ?? 5;
  const t = clampPartialSliderTenth(raw);

  const pinchY = 60;
  const upperTop = 10;
  const lowerBottom = 110;
  const upperBulb = `M 16 ${upperTop} L 48 ${upperTop} L 32 ${pinchY} Z`;
  const lowerBulb = `M 32 ${pinchY} L 48 ${lowerBottom} L 16 ${lowerBottom} Z`;

  const upperSpan = pinchY - upperTop;

  const { upperLevel, lowerLevel, caption } = useMemo(() => {
    const timeSuffix =
      contributedMinutes != null
        ? ` · ${formatRhythmDuration(contributedMinutes)}`
        : "";
    if (variant === "start") {
      const upper = t / 10;
      return {
        upperLevel: upper,
        lowerLevel: 1 - upper,
        caption: `${t * 10}% in upper bulb${timeSuffix}`,
      };
    }
    const lower = t / 10;
    return {
      upperLevel: 1 - lower,
      lowerLevel: lower,
      caption: `${t * 10}% in lower bulb${timeSuffix}`,
    };
  }, [variant, t, contributedMinutes]);

  const upperSandY = pinchY - upperLevel * upperSpan;
  const upperSurfaceHalfW = (16 * (pinchY - upperSandY)) / upperSpan;
  const lowerSandPaths = useMemo(
    () => buildLowerSandPaths(lowerLevel, pinchY, lowerBottom),
    [lowerLevel, pinchY, lowerBottom],
  );

  const ticks = useMemo(
    () =>
      Array.from(
        { length: PARTIAL_SLIDER_MAX_TENTHS - PARTIAL_SLIDER_MIN_TENTHS + 1 },
        (_, i) => i + PARTIAL_SLIDER_MIN_TENTHS,
      ),
    [],
  );

  const ariaLabel =
    variant === "start"
      ? "Sand remaining in upper bulb at day start"
      : "Sand accumulated in lower bulb at day end";

  return (
    <div className={cn("flex w-full flex-col items-center gap-1.5", className)}>
      <svg viewBox="0 0 64 120" className="h-[7.25rem] w-[4rem] shrink-0" aria-hidden>
        <defs>
          <clipPath id={`${uid}-upper`}>
            <path d={upperBulb} />
          </clipPath>
          <clipPath id={`${uid}-lower`}>
            <path d={lowerBulb} />
          </clipPath>
          <linearGradient
            id={`${uid}-sand-upper`}
            gradientUnits="userSpaceOnUse"
            x1="32"
            y1={upperTop}
            x2="32"
            y2={pinchY}
          >
            <stop offset="0%" stopColor={SAND_TOP} />
            <stop offset="50%" stopColor={SAND_MID} />
            <stop offset="100%" stopColor={SAND_DEEP} />
          </linearGradient>
          <linearGradient
            id={`${uid}-sand-lower`}
            gradientUnits="userSpaceOnUse"
            x1="32"
            y1={pinchY}
            x2="32"
            y2={lowerBottom}
          >
            <stop offset="0%" stopColor={SAND_TOP} />
            <stop offset="50%" stopColor={SAND_MID} />
            <stop offset="100%" stopColor={SAND_DEEP} />
          </linearGradient>
          <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.07} />
            <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
          </linearGradient>
        </defs>

        <path
          d={upperBulb}
          fill="var(--bg-muted)"
          fillOpacity={0.65}
          stroke="var(--border)"
          strokeWidth={1.15}
        />
        <path
          d={lowerBulb}
          fill="var(--bg-muted)"
          fillOpacity={0.65}
          stroke="var(--border)"
          strokeWidth={1.15}
        />
        <rect
          x={0}
          y={upperSandY}
          width={64}
          height={upperSpan + 8}
          fill={`url(#${uid}-sand-upper)`}
          clipPath={`url(#${uid}-upper)`}
          style={{ transition: "y 280ms ease-out" }}
        />
        {lowerSandPaths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill={`url(#${uid}-sand-lower)`}
            clipPath={`url(#${uid}-lower)`}
          />
        ))}

        <path d={upperBulb} fill={`url(#${uid}-glass)`} pointerEvents="none" />
        <path d={lowerBulb} fill={`url(#${uid}-glass)`} pointerEvents="none" />

        {variant === "start" && (
          <ellipse
            cx={32}
            cy={upperSandY + 1.5}
            rx={Math.max(2, upperSurfaceHalfW * 0.92)}
            ry={1.8}
            fill={SAND_TOP}
            opacity={0.4}
            clipPath={`url(#${uid}-upper)`}
          />
        )}
      </svg>

      <div className="relative w-full max-w-[10.5rem] px-0.5">
        <div className="pointer-events-none flex justify-between px-[3px]" aria-hidden>
          {ticks.map((tick) => (
            <span
              key={tick}
              className={cn(
                "h-2 w-px bg-[var(--border)]",
                tick === t && "bg-[var(--text-muted)]",
              )}
            />
          ))}
        </div>
        <input
          type="range"
          min={PARTIAL_SLIDER_MIN_TENTHS}
          max={PARTIAL_SLIDER_MAX_TENTHS}
          step={1}
          disabled={disabled}
          value={t}
          aria-label={ariaLabel}
          className="rhythm-sand-slider w-full"
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>

      {!hideCaption && (
        <p className="text-center font-mono text-[9px] leading-snug text-[var(--text-muted)]">
          {caption}
        </p>
      )}
    </div>
  );
}
