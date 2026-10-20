import type { rhythmSessions } from "@/db/schema";
import {
  expandLegacyToEntries,
  foldEntriesToLegacy,
  type RhythmDayState,
  type RhythmFlipEntry,
} from "@/lib/rhythm/entries";
import { rhythmEffectiveFromEntries } from "@/lib/rhythm/entries";
import type { RhythmSandglassConfig } from "@/lib/rhythm/effective-minutes";
import {
  rhythmBreakMinutes,
  rhythmEffectiveMinutes,
} from "@/lib/rhythm/effective-minutes";

export type RhythmSessionRecord = typeof rhythmSessions.$inferSelect;

export function parseEntriesJson(raw: string | null | undefined): RhythmFlipEntry[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RhythmFlipEntry[];
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function recordToDayState(row: RhythmSessionRecord): RhythmDayState {
  const parsed = parseEntriesJson(row.entriesJson);
  const entries =
    parsed ??
    expandLegacyToEntries({
      startsWithOddCycle: row.startsWithOddCycle,
      fullCycleCount: row.fullCycleCount,
      startPartialTenths: row.startPartialTenths,
      endPartialTenths: row.endPartialTenths,
    });
  return {
    startTime: row.startTime,
    endTime: row.endTime,
    startTimeConfirmed: row.startTimeConfirmed ?? false,
    endTimeConfirmed: row.endTimeConfirmed ?? false,
    startsWithOddCycle: row.startsWithOddCycle,
    continuedFromPreviousDay: row.continuedFromPreviousDay,
    entries,
  };
}

export function dayStateToPayload(day: RhythmDayState) {
  const folded = foldEntriesToLegacy(day.startsWithOddCycle, day.entries);
  return {
    startTime: day.startTime,
    endTime: day.endTime,
    startTimeConfirmed: day.startTimeConfirmed,
    endTimeConfirmed: day.endTimeConfirmed,
    continuedFromPreviousDay: day.continuedFromPreviousDay,
    entriesJson: JSON.stringify(day.entries),
    ...folded,
    startsWithOddCycle: day.startsWithOddCycle,
  };
}

export function effectiveForRecord(
  row: Pick<
    RhythmSessionRecord,
    | "startsWithOddCycle"
    | "fullCycleCount"
    | "startPartialTenths"
    | "endPartialTenths"
    | "entriesJson"
  >,
  cfg: RhythmSandglassConfig,
): number {
  const parsed = parseEntriesJson(row.entriesJson);
  if (parsed && parsed.length > 0) {
    return rhythmEffectiveFromEntries(row.startsWithOddCycle, parsed, cfg);
  }
  return rhythmEffectiveMinutes(row, cfg);
}

export function breakForRecord(
  row: Pick<RhythmSessionRecord, "startTime" | "endTime" | "entriesJson" | "startsWithOddCycle" | "fullCycleCount" | "startPartialTenths" | "endPartialTenths">,
  cfg: RhythmSandglassConfig,
): number {
  const effective = effectiveForRecord(row, cfg);
  const start = row.startTime;
  const end = row.endTime;
  return rhythmBreakMinutes(
    {
      startTime: start,
      endTime: end,
      startsWithOddCycle: row.startsWithOddCycle,
      fullCycleCount: row.fullCycleCount,
      startPartialTenths: row.startPartialTenths,
      endPartialTenths: row.endPartialTenths,
    },
    cfg,
  );
}

// re-export break uses effective from entries - fix breakForRecord to use computed effective
export function breakForRecordFixed(
  row: Pick<RhythmSessionRecord, "startTime" | "endTime" | "startTimeConfirmed" | "endTimeConfirmed"> &
    Parameters<typeof effectiveForRecord>[0],
  cfg: RhythmSandglassConfig,
): number {
  if (!row.startTimeConfirmed || !row.endTimeConfirmed) return 0;
  const effective = effectiveForRecord(row, cfg);
  const [sh, sm] = row.startTime.split(":").map(Number);
  const [eh, em] = row.endTime.split(":").map(Number);
  const span = eh * 60 + em - (sh * 60 + sm);
  return Math.round(Math.max(0, span - effective) * 10) / 10;
}

export function rhythmStartTimeForDisplay(
  row: Pick<RhythmSessionRecord, "startTime" | "startTimeConfirmed">,
): string | undefined {
  return row.startTimeConfirmed ? row.startTime : undefined;
}

export function rhythmEndTimeForDisplay(
  row: Pick<RhythmSessionRecord, "endTime" | "endTimeConfirmed">,
): string | undefined {
  return row.endTimeConfirmed ? row.endTime : undefined;
}
