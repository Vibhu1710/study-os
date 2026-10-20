import { and, eq } from "drizzle-orm";
import { getDb, newId, nowIso } from "@/db";
import { objectives, rhythmSessions } from "@/db/schema";
import { assertWritable } from "@/lib/objective-context";
import { isDateInRange } from "@/lib/dates";
import { parseTimeToMinutes, type RhythmSessionInput } from "@/lib/rhythm/effective-minutes";
import { effectiveForRecord, breakForRecordFixed } from "@/lib/rhythm/session-state";
import { resolveRhythmConfigForObjective } from "@/lib/services/rhythm-config";
import { todayString } from "@/lib/study-day";

export type RhythmSessionRecord = typeof rhythmSessions.$inferSelect;

export type RhythmSessionPayload = {
  startTime: string;
  endTime: string;
  startsWithOddCycle: boolean;
  fullCycleCount: number;
  startPartialTenths: number;
  endPartialTenths: number;
  continuedFromPreviousDay: boolean;
  entriesJson?: string | null;
  startTimeConfirmed?: boolean;
  endTimeConfirmed?: boolean;
};

function validateSession(
  objectiveStart: string,
  objectiveEnd: string,
  date: string,
  payload: RhythmSessionPayload,
) {
  const today = todayString();
  if (date > today) throw new Error("Cannot log momentum on future dates.");
  if (!isDateInRange(date, objectiveStart, objectiveEnd)) {
    throw new Error("Date is outside this study cycle.");
  }
  if (
    payload.startTimeConfirmed &&
    payload.endTimeConfirmed &&
    parseTimeToMinutes(payload.endTime) <= parseTimeToMinutes(payload.startTime)
  ) {
    throw new Error("Clock-out must be after clock-in on the same day.");
  }
  for (const t of [payload.startPartialTenths, payload.endPartialTenths]) {
    if (t < 0 || t > 9) throw new Error("Partial sand steps must be 0–9 (tenths).");
  }
  if (payload.fullCycleCount < 0) throw new Error("Cycle count cannot be negative.");
}

export async function getRhythmSession(objectiveId: string, date: string) {
  const db = getDb();
  return db.query.rhythmSessions.findFirst({
    where: and(
      eq(rhythmSessions.objectiveId, objectiveId),
      eq(rhythmSessions.date, date),
    ),
  });
}

export async function listRhythmSessionsForObjective(objectiveId: string) {
  const db = getDb();
  return db.query.rhythmSessions.findMany({
    where: eq(rhythmSessions.objectiveId, objectiveId),
    orderBy: (s, { asc }) => [asc(s.date)],
  });
}

export async function upsertRhythmSession(
  objectiveId: string,
  date: string,
  payload: RhythmSessionPayload,
) {
  const db = getDb();
  const objective = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  if (!objective) throw new Error("Objective not found");
  assertWritable(objective);
  validateSession(objective.startDate, objective.endDate, date, payload);

  const existing = await getRhythmSession(objectiveId, date);
  const ts = nowIso();
  const row = {
    ...payload,
    entriesJson: payload.entriesJson ?? null,
    startTimeConfirmed: payload.startTimeConfirmed ?? false,
    endTimeConfirmed: payload.endTimeConfirmed ?? false,
    updatedAt: ts,
  };
  if (existing) {
    await db
      .update(rhythmSessions)
      .set(row)
      .where(eq(rhythmSessions.id, existing.id));
    return existing.id;
  }
  const id = newId();
  await db.insert(rhythmSessions).values({
    id,
    objectiveId,
    date,
    ...row,
  });
  return id;
}

export async function deleteRhythmSession(objectiveId: string, date: string) {
  const db = getDb();
  const objective = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  if (!objective) throw new Error("Objective not found");
  assertWritable(objective);
  await db
    .delete(rhythmSessions)
    .where(
      and(eq(rhythmSessions.objectiveId, objectiveId), eq(rhythmSessions.date, date)),
    );
}

export async function computeSessionMetrics(
  objectiveId: string,
  session: RhythmSessionInput & { startTime: string; endTime: string },
) {
  const cfg = await resolveRhythmConfigForObjective(objectiveId);
  const effective = effectiveForRecord(session as typeof rhythmSessions.$inferSelect, cfg);
  const breakMin = breakForRecordFixed(session as typeof rhythmSessions.$inferSelect, cfg);
  return { effective, breakMin, cfg };
}

export async function getRhythmEffortCalendarStats(objectiveId: string) {
  const sessions = await listRhythmSessionsForObjective(objectiveId);
  const cfg = await resolveRhythmConfigForObjective(objectiveId);
  const byDate: Record<string, { totalWeight: number; effectiveMinutes: number }> = {};
  for (const s of sessions) {
    const effective = effectiveForRecord(s, cfg);
    byDate[s.date] = {
      totalWeight: effective / 60,
      effectiveMinutes: effective,
    };
  }
  return byDate;
}

export type RhythmAggregate = {
  avgStartMinutes: number | null;
  avgEndMinutes: number | null;
  avgEffectiveMinutes: number | null;
  avgBreakMinutes: number | null;
  count: number;
};

function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export async function computeRhythmAggregates(
  objectiveId: string,
  options: { lastN?: number } = {},
): Promise<RhythmAggregate> {
  const sessions = await listRhythmSessionsForObjective(objectiveId);
  const cfg = await resolveRhythmConfigForObjective(objectiveId);
  let rows = sessions.map((s) => {
    const effective = effectiveForRecord(s, cfg);
    const breakMin = breakForRecordFixed(s, cfg);
    return {
      start: s.startTimeConfirmed ? parseTimeToMinutes(s.startTime) : null,
      end: s.endTimeConfirmed ? parseTimeToMinutes(s.endTime) : null,
      effective,
      breakMin: s.startTimeConfirmed && s.endTimeConfirmed ? breakMin : null,
    };
  });
  if (options.lastN != null && rows.length > options.lastN) {
    rows = rows.slice(-options.lastN);
  }
  const starts = rows.map((r) => r.start).filter((n): n is number => n != null);
  const ends = rows.map((r) => r.end).filter((n): n is number => n != null);
  const breaks = rows.map((r) => r.breakMin).filter((n): n is number => n != null);
  return {
    avgStartMinutes: average(starts),
    avgEndMinutes: average(ends),
    avgEffectiveMinutes: average(rows.map((r) => r.effective)),
    avgBreakMinutes: average(breaks),
    count: rows.length,
  };
}
