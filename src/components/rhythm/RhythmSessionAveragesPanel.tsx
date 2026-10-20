"use client";

import { cn } from "@/lib/cn";
import { formatRhythmDuration, formatTime12 } from "@/lib/rhythm/effective-minutes";
import { RhythmAnalogClock } from "@/components/rhythm/RhythmAnalogClock";

const STUDY_DAY_REFERENCE_MINUTES = 8 * 60;
type Aggregate = {
  avgStartMinutes: number | null;
  avgEndMinutes: number | null;
  avgEffectiveMinutes: number | null;
  avgBreakMinutes: number | null;
  count: number;
};

function splitHoursMinutes(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return { h, m };
}

function minutesToHhmm(mins: number | null): string {
  if (mins == null) return "00:00";
  const h = Math.floor(mins / 60) % 24;
  const m = Math.round(mins % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function clockSpanMinutes(start: number, end: number): number {
  let span = end - start;
  if (span <= 0) span += 24 * 60;
  return span;
}

function StudyHero({
  minutes,
  windowLabel,
  sampleCount,
}: {
  minutes: number | null;
  windowLabel: string;
  sampleCount: number;
}) {
  const hasData = minutes != null && minutes > 0;
  const { h, m } = hasData ? splitHoursMinutes(minutes!) : { h: 0, m: 0 };
  const fillPct = hasData
    ? Math.min(100, (minutes! / STUDY_DAY_REFERENCE_MINUTES) * 100)
    : 0;

  const sampleLine =
    sampleCount > 0 ? `${sampleCount} logged day${sampleCount === 1 ? "" : "s"}` : "No logs yet";

  return (
    <div className="flex min-h-[9.5rem] min-w-0 flex-1 flex-col rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-muted)_55%,var(--bg-elevated))] px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
            Average study per day
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{windowLabel}</p>
        </div>
        <p className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
          {sampleLine}
        </p>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 items-start gap-5 pb-2 sm:gap-6 sm:pb-3">
        <div
          className="flex w-10 shrink-0 flex-col items-center pb-0.5 sm:w-11"
          aria-hidden={!hasData}
        >
          <p className="mb-1.5 font-mono text-[9px] text-[var(--text-muted)]">8h</p>
          <div className="relative h-[6.25rem] w-3 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--border)_75%,transparent)] sm:h-[7.25rem]">
            {hasData && (
              <div
                className="absolute bottom-0 left-0 w-full rounded-full bg-gradient-to-t from-[#3d8bfd] via-[var(--accent)] to-[#9cd1ff]"
                style={{ height: `${Math.max(fillPct, 4)}%` }}
              />
            )}
          </div>
          <p className="mt-2 font-mono text-[9px] text-[var(--text-muted)]">0h</p>
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center">
          {hasData ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                <span className="font-mono text-xl font-semibold tabular-nums leading-none tracking-tight text-[var(--text)] sm:text-2xl">
                  {h}
                  <span className="ml-0.5 text-sm font-medium text-[var(--accent)]">h</span>
                </span>
                <span className="font-mono text-xl font-semibold tabular-nums leading-none tracking-tight text-[var(--text)] sm:text-2xl">
                  {m}
                  <span className="ml-0.5 text-sm font-medium text-[var(--accent)]">m</span>
                </span>
              </div>
              <p className="mt-2.5 max-w-sm text-[10px] leading-snug text-[var(--text-muted)]">
                Effective sandglass time — your main momentum signal, measured against an{" "}
                <span className="text-[var(--text)]">8-hour reference day</span>.
              </p>
            </>
          ) : (
            <>
              <p className="font-mono text-lg font-medium text-[var(--text-muted)]">—</p>
              <p className="mt-2 max-w-sm text-[10px] leading-snug text-[var(--text-muted)]">
                Log clock-in, study cycles, and clock-out on a few days — this gauge fills as your
                typical day takes shape.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TypicalDayStrip({ avg }: { avg: Aggregate }) {
  const hasStart = avg.avgStartMinutes != null;
  const hasEnd = avg.avgEndMinutes != null;
  const hasSpan = hasStart && hasEnd;
  const spanMin = hasSpan
    ? clockSpanMinutes(avg.avgStartMinutes!, avg.avgEndMinutes!)
    : 0;
  const effective = avg.avgEffectiveMinutes ?? 0;
  const breakMin = avg.avgBreakMinutes ?? 0;
  const hasStrip = hasSpan && spanMin > 0;

  const studyPct = hasStrip ? Math.min(100, (effective / spanMin) * 100) : 0;
  const breakPct = hasStrip ? Math.min(100 - studyPct, (breakMin / spanMin) * 100) : 0;
  const spanHours = spanMin / 60;

  return (
    <div className="flex min-h-[9.5rem] min-w-0 flex-1 flex-col rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-muted)_42%,var(--bg-elevated))] px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
            Typical day span
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            From average clock-in to clock-out
          </p>
        </div>
        {hasStrip && (
          <p className="font-mono text-xs tabular-nums text-[var(--text)]">
            {formatRhythmDuration(spanMin)}{" "}
            <span className="text-[var(--text-muted)]">window</span>
          </p>
        )}
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col justify-center gap-4">
        <div className="flex items-center gap-3.5 sm:gap-5">
          <div
            className={cn(
              "flex shrink-0 flex-col items-center gap-2",
              !hasStart && "opacity-40",
            )}
          >
            <RhythmAnalogClock
              variant="session"
              time={minutesToHhmm(avg.avgStartMinutes)}
              size={hasStrip ? 80 : 72}
            />
            <div className="text-center">
              <p className="font-mono text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
                Start
              </p>
              <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-[var(--text)]">
                {hasStart
                  ? formatTime12(minutesToHhmm(avg.avgStartMinutes))
                  : "—"}
              </p>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div
              className="relative h-12 overflow-hidden rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] sm:h-[3.25rem]"
              role="img"
              aria-label={
                hasStrip
                  ? `Study ${Math.round(studyPct)}%, break ${Math.round(breakPct)}% of typical window`
                  : "Typical day timeline"
              }
            >
              {!hasStrip ? (
                <div className="flex h-full items-center justify-center">
                  <div className="h-0.5 w-[85%] rounded-full bg-[color-mix(in_srgb,var(--border)_80%,transparent)]" />
                </div>
              ) : (
                <div className="flex h-full w-full">
                  <div
                    className="h-full bg-gradient-to-r from-[#3d8bfd] to-[var(--accent)]"
                    style={{ width: `${studyPct}%` }}
                    title={`Effective study · ${formatRhythmDuration(effective)}`}
                  />
                  {breakPct > 0.5 && (
                    <div
                      className="h-full bg-gradient-to-r from-[color-mix(in_srgb,var(--text-muted)_28%,transparent)] to-[color-mix(in_srgb,var(--text-muted)_12%,transparent)]"
                      style={{ width: `${breakPct}%` }}
                      title={`Break · ${formatRhythmDuration(breakMin)}`}
                    />
                  )}
                  {studyPct + breakPct < 99 && (
                    <div className="h-full flex-1 bg-transparent" />
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 font-mono text-[9px] text-[var(--text-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                Study
                {effective > 0 && (
                  <span className="text-[var(--text)]">
                    · {formatRhythmDuration(effective)}
                  </span>
                )}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[color-mix(in_srgb,var(--text-muted)_45%,transparent)]" />
                Break
                {breakMin > 0 && (
                  <span className="text-[var(--text)]">
                    · {formatRhythmDuration(breakMin)}
                  </span>
                )}
              </span>
            </div>
          </div>

          <div
            className={cn(
              "flex shrink-0 flex-col items-center gap-2",
              !hasEnd && "opacity-40",
            )}
          >
            <RhythmAnalogClock
              variant="session"
              time={minutesToHhmm(avg.avgEndMinutes)}
              size={hasStrip ? 80 : 72}
            />
            <div className="text-center">
              <p className="font-mono text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
                Finish
              </p>
              <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-[var(--text)]">
                {hasEnd ? formatTime12(minutesToHhmm(avg.avgEndMinutes)) : "—"}
              </p>
            </div>
          </div>
        </div>

        {hasStrip && spanHours >= 6 && (
          <p className="text-center text-[11px] leading-relaxed text-[var(--text-muted)]">
            Longer spans aren&apos;t automatically worse — the strip shows how much of that window
            is sandglass study vs idle break.
          </p>
        )}
      </div>
    </div>
  );
}

export function RhythmSessionAveragesPanel({
  avg,
  avgWindow,
  onAvgWindowChange,
}: {
  avg: Aggregate;
  avgWindow: "last5" | "cycle";
  onAvgWindowChange: (w: "last5" | "cycle") => void;
}) {
  const windowLabel =
    avgWindow === "last5" ? "Based on your last 5 logged days" : "Based on the full cycle so far";

  return (
    <section className="card flex h-full min-h-[22rem] flex-col border-[color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[color-mix(in_srgb,var(--bg-muted)_35%,var(--bg-elevated))] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            Session averages
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            How your momentum is trending
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5">
          {(
            [
              { id: "last5" as const, label: "Last 5 days" },
              { id: "cycle" as const, label: "Full cycle" },
            ] as const
          ).map((w) => (
            <button
              key={w.id}
              type="button"
              className={cn(
                "rounded-md px-3 py-1 font-mono text-[10px]",
                avgWindow === w.id
                  ? "bg-[var(--accent)] font-semibold text-[#0d1117]"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
              onClick={() => onAvgWindowChange(w.id)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 pt-3.5 sm:gap-4 sm:pt-4">
        <StudyHero
          minutes={avg.avgEffectiveMinutes}
          windowLabel={windowLabel}
          sampleCount={avg.count}
        />
        <TypicalDayStrip avg={avg} />
      </div>
    </section>
  );
}
