"use client";

import { useCallback, useRef } from "react";
import { cn } from "@/lib/cn";
import { parseTimeToMinutes } from "@/lib/rhythm/effective-minutes";

/** Stable SVG coords across SSR and client (avoids float hydration mismatch). */
function svgCoord(n: number) {
  return Math.round(n * 100) / 100;
}

export function RhythmAnalogClock({
  time,
  size = 88,
  label,
  sublabel,
  className,
  interactive = false,
  variant = "default",
  onTimeChange,
}: {
  /** HH:mm or minutes from midnight when isDuration */
  time: string | number;
  size?: number;
  label?: string;
  sublabel?: string;
  className?: string;
  interactive?: boolean;
  /** Softer dial for session summary cards (non-interactive). */
  variant?: "default" | "session";
  onTimeChange?: (hhmm: string) => void;
}) {
  const minutes =
    typeof time === "number" ? time : parseTimeToMinutes(time);
  const h = Math.floor(minutes / 60) % 12;
  const m = minutes % 60;
  const hourAngle = (h + m / 60) * 30;
  const minuteAngle = m * 6;
  const ref = useRef<SVGCircleElement>(null);

  const pickFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      if (!interactive || !onTimeChange || !ref.current) return;
      const svg = ref.current.ownerSVGElement;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      if (deg < 0) deg += 360;
      const dist = Math.hypot(dx, dy);
      const r = rect.width / 2;
      const isMinute = dist > r * 0.45;
      if (isMinute) {
        const newM = Math.round(deg / 6) % 60;
        const newH = Math.floor(minutes / 60) % 24;
        onTimeChange(
          `${newH.toString().padStart(2, "0")}:${newM.toString().padStart(2, "0")}`,
        );
      } else {
        const newH12 = Math.round(deg / 30) % 12;
        const h24 = Math.floor(minutes / 60);
        const base = h24 - (h24 % 12);
        const newH = (base + newH12) % 24;
        onTimeChange(
          `${newH.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
        );
      }
    },
    [interactive, onTimeChange, minutes, m],
  );

  const session = variant === "session";
  const r = svgCoord(size / 2 - (session ? 6 : 4));
  const cx = svgCoord(size / 2);
  const cy = svgCoord(size / 2);

  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      <svg
        width={size}
        height={size}
        className={cn(
          "select-none",
          interactive && "cursor-pointer touch-none",
        )}
        onPointerDown={(e) => {
          e.preventDefault();
          pickFromEvent(e.clientX, e.clientY);
        }}
      >
        {session && (
          <circle
            cx={cx}
            cy={cy}
            r={svgCoord(r + 3)}
            fill="none"
            stroke="color-mix(in srgb, var(--accent) 28%, transparent)"
            strokeWidth={1}
          />
        )}
        <circle
          ref={ref}
          cx={cx}
          cy={cy}
          r={r}
          fill={
            session
              ? "color-mix(in srgb, var(--bg-muted) 88%, var(--bg-elevated))"
              : "var(--bg-muted)"
          }
          stroke={session ? "color-mix(in srgb, var(--border) 70%, transparent)" : "var(--border)"}
          strokeWidth={session ? 1 : 1.5}
        />
        {session
          ? [0, 90, 180, 270].map((deg) => {
              const a = ((deg - 90) * Math.PI) / 180;
              return (
                <circle
                  key={deg}
                  cx={svgCoord(cx + Math.cos(a) * (r - 10))}
                  cy={svgCoord(cy + Math.sin(a) * (r - 10))}
                  r={1.25}
                  fill="var(--text-muted)"
                  opacity={0.55}
                />
              );
            })
          : Array.from({ length: 12 }).map((_, i) => {
              const a = ((i * 30 - 90) * Math.PI) / 180;
              const x1 = svgCoord(cx + Math.cos(a) * (r - 8));
              const y1 = svgCoord(cy + Math.sin(a) * (r - 8));
              const x2 = svgCoord(cx + Math.cos(a) * (r - (i % 3 === 0 ? 2 : 5)));
              const y2 = svgCoord(cy + Math.sin(a) * (r - (i % 3 === 0 ? 2 : 5)));
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="var(--text-muted)"
                  strokeWidth={i % 3 === 0 ? 1.5 : 1}
                  opacity={0.7}
                />
              );
            })}
        <line
          x1={cx}
          y1={cy}
          x2={svgCoord(cx + Math.cos(((hourAngle - 90) * Math.PI) / 180) * (r * (session ? 0.46 : 0.5)))}
          y2={svgCoord(cy + Math.sin(((hourAngle - 90) * Math.PI) / 180) * (r * (session ? 0.46 : 0.5)))}
          stroke="var(--text)"
          strokeWidth={session ? 1.75 : 2.5}
          strokeLinecap="round"
          opacity={session ? 0.92 : 1}
        />
        <line
          x1={cx}
          y1={cy}
          x2={svgCoord(cx + Math.cos(((minuteAngle - 90) * Math.PI) / 180) * (r * (session ? 0.62 : 0.72)))}
          y2={svgCoord(cy + Math.sin(((minuteAngle - 90) * Math.PI) / 180) * (r * (session ? 0.62 : 0.72)))}
          stroke="var(--accent)"
          strokeWidth={session ? 1.25 : 1.5}
          strokeLinecap="round"
        />
        <circle
          cx={cx}
          cy={cy}
          r={session ? 2.25 : 3}
          fill="var(--accent)"
          stroke={session ? "var(--bg-elevated)" : undefined}
          strokeWidth={session ? 1 : undefined}
        />
      </svg>
      {label && (
        <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
          {label}
        </p>
      )}
      {sublabel && <p className="font-mono text-xs font-medium text-[var(--text)]">{sublabel}</p>}
    </div>
  );
}

/** Duration as time on dial (e.g. 2h30 → 2:30 position). */
export function RhythmDurationClock({
  totalMinutes,
  size = 72,
  label,
  sublabel,
}: {
  totalMinutes: number | null;
  size?: number;
  label: string;
  sublabel?: string;
}) {
  if (totalMinutes == null || totalMinutes <= 0) {
    return (
      <RhythmAnalogClock
        time="00:00"
        size={size}
        label={label}
        sublabel="—"
        className="opacity-40"
      />
    );
  }
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  const display = `${h}:${m.toString().padStart(2, "0")}`;
  return (
    <RhythmAnalogClock
      time={`${Math.min(h, 23).toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`}
      size={size}
      label={label}
      sublabel={sublabel ?? display}
    />
  );
}
