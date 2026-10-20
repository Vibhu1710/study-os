import type { DayStat } from "@/components/calendar/ContributionCalendar";
import type { RhythmSandglassConfig } from "@/lib/rhythm/effective-minutes";
import type { RhythmSessionRecord } from "@/lib/services/rhythm-sessions";
import {
  breakForRecordFixed,
  effectiveForRecord,
  rhythmEndTimeForDisplay,
  rhythmStartTimeForDisplay,
} from "@/lib/rhythm/session-state";

export function buildEffortCalendarDays(
  coverage: Record<string, DayStat>,
  sessions: RhythmSessionRecord[],
  cfg: RhythmSandglassConfig,
): Record<string, DayStat> {
  const out: Record<string, DayStat> = { ...coverage };
  for (const s of sessions) {
    const effective = effectiveForRecord(s, cfg);
    const breakMin = breakForRecordFixed(s, cfg);
    const rhythmStartTime = rhythmStartTimeForDisplay(s);
    const rhythmEndTime = rhythmEndTimeForDisplay(s);
    out[s.date] = {
      ...(out[s.date] ?? { totalWeight: 0 }),
      rhythmEffectiveMinutes: effective,
      ...(rhythmStartTime ? { rhythmStartTime } : {}),
      ...(rhythmEndTime ? { rhythmEndTime } : {}),
      ...(s.startTimeConfirmed && s.endTimeConfirmed && breakMin > 0
        ? { rhythmBreakMinutes: breakMin }
        : {}),
    };
  }
  return out;
}

export function mergeRhythmIntoCoverageDays(
  coverage: Record<string, DayStat>,
  sessions: RhythmSessionRecord[],
  cfg: RhythmSandglassConfig,
): Record<string, DayStat> {
  const out = { ...coverage };
  for (const s of sessions) {
    const effective = effectiveForRecord(s, cfg);
    const breakMin = breakForRecordFixed(s, cfg);
    const prev = out[s.date] ?? { totalWeight: 0 };
    const rhythmStartTime = rhythmStartTimeForDisplay(s);
    const rhythmEndTime = rhythmEndTimeForDisplay(s);
    out[s.date] = {
      ...prev,
      rhythmEffectiveMinutes: effective,
      ...(rhythmStartTime ? { rhythmStartTime } : {}),
      ...(rhythmEndTime ? { rhythmEndTime } : {}),
      ...(s.startTimeConfirmed && s.endTimeConfirmed && breakMin > 0
        ? { rhythmBreakMinutes: breakMin }
        : {}),
    };
  }
  return out;
}
