"use client";

import { useMemo } from "react";
import {
  formatRhythmDuration,
  formatTime12,
  type RhythmSandglassConfig,
} from "@/lib/rhythm/effective-minutes";
import {
  fullCyclesLogLabel,
  parseDayFlipStructure,
  rhythmStudyMinutesBreakdown,
  startPartialLogLabel,
  endPartialLogLabel,
  type RhythmDayState,
} from "@/lib/rhythm/entries";
import type { DayStat } from "@/components/calendar/ContributionCalendar";

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className={accent ? "text-[var(--accent)]" : undefined}>{value}</dd>
    </div>
  );
}

export function RhythmLogCardBody({
  session,
  stat,
  sandglass,
  selectedDate,
  today,
}: {
  session: RhythmDayState | null;
  stat: DayStat | undefined;
  sandglass: RhythmSandglassConfig;
  selectedDate: string;
  today: string;
}) {
  const flip = session ? parseDayFlipStructure(session.entries) : null;
  const breakdown = useMemo(() => {
    if (!session) return null;
    return rhythmStudyMinutesBreakdown(
      session.startsWithOddCycle,
      session.entries,
      sandglass,
    );
  }, [session, sandglass]);

  const hasCycles =
    flip != null &&
    (flip.completeCount > 0 ||
      flip.startPartialTenths != null ||
      flip.endPartialLowerTenths != null);
  const hasEffective = (stat?.rhythmEffectiveMinutes ?? 0) > 0;
  const hasTimes = Boolean(stat?.rhythmStartTime || stat?.rhythmEndTime);
  const hasAnything = hasCycles || hasEffective || hasTimes;

  if (selectedDate > today) {
    return (
      <p className="text-sm text-[var(--text-muted)]">Future days cannot be logged.</p>
    );
  }

  if (!hasAnything) {
    return (
      <p className="text-sm text-[var(--text-muted)]">No momentum logged this day.</p>
    );
  }

  const showSummary = hasCycles && session != null && breakdown != null;
  const showSession = hasTimes || hasEffective || (stat?.rhythmBreakMinutes ?? 0) > 0;

  return (
    <div className="space-y-2.5 font-mono text-xs">
      {showSummary && (
        <dl className="space-y-2">
          <Row
            label="Started"
            value={session!.startsWithOddCycle ? "Odd" : "Even"}
            accent
          />
          {flip!.startPartialTenths != null && (
            <Row
              label="Start partial"
              value={startPartialLogLabel(
                flip!.startPartialTenths,
                breakdown!.startPartialMinutes,
              )}
            />
          )}
          <Row
            label="Full cycles"
            value={fullCyclesLogLabel(flip!.completeCount, breakdown!.completeMinutes)}
          />
          {flip!.endPartialLowerTenths != null && (
            <Row
              label="End partial"
              value={endPartialLogLabel(
                flip!.endPartialLowerTenths,
                breakdown!.endPartialMinutes,
              )}
            />
          )}
        </dl>
      )}

      {showSummary && showSession && (
        <div className="border-t border-[var(--border)]" aria-hidden />
      )}

      {showSession && (
        <dl className="space-y-2">
          {stat?.rhythmStartTime && (
            <Row label="Clock in" value={formatTime12(stat.rhythmStartTime)} />
          )}
          {stat?.rhythmEndTime && (
            <Row label="Clock out" value={formatTime12(stat.rhythmEndTime)} />
          )}
          {hasEffective && (
            <Row
              label="Effective"
              value={formatRhythmDuration(stat!.rhythmEffectiveMinutes ?? 0)}
              accent
            />
          )}
          {(stat?.rhythmBreakMinutes ?? 0) > 0 && (
            <Row
              label="Break"
              value={formatRhythmDuration(stat!.rhythmBreakMinutes ?? 0)}
            />
          )}
        </dl>
      )}
    </div>
  );
}
