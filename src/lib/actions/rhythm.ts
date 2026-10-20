"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, newId, nowIso } from "@/db";
import { objectives, rhythmDayNotes } from "@/db/schema";
import { isDateInRange } from "@/lib/dates";
import { assertWritable } from "@/lib/objective-context";
import { getObjectivePhaseBounds } from "@/lib/services/phase-guard";
import {
  deleteRhythmSession,
  getRhythmEffortCalendarStats,
  getRhythmSession,
  listRhythmSessionsForObjective,
  upsertRhythmSession,
  computeRhythmAggregates,
  type RhythmSessionPayload,
} from "@/lib/services/rhythm-sessions";
import {
  getGlobalRhythmConfig,
  updateGlobalRhythmConfig,
} from "@/lib/services/rhythm-config";
import { previousDateString } from "@/lib/rhythm/effective-minutes";
import {
  defaultStartPartialTenthsFromPrevious,
  defaultStartsWithOddFromPrevious,
} from "@/lib/rhythm/effective-minutes";
import {
  buildDayFlipEntries,
  endStateFromEntries,
  parseDayFlipStructure,
  rhythmEffectiveFromEntries,
} from "@/lib/rhythm/entries";
import { dayStateToPayload, recordToDayState } from "@/lib/rhythm/session-state";
import type { RhythmDayState } from "@/lib/rhythm/entries";
import { resolveRhythmConfigForObjective } from "@/lib/services/rhythm-config";
import { todayString } from "@/lib/study-day";

function revalidate() {
  revalidatePath("/rhythm");
  revalidatePath("/settings");
}

export async function fetchRhythmGlobalConfig() {
  return getGlobalRhythmConfig();
}

export async function saveRhythmGlobalConfig(oddMinutes: number, evenMinutes: number) {
  await updateGlobalRhythmConfig(oddMinutes, evenMinutes);
  revalidate();
}

export async function fetchRhythmSession(objectiveId: string, date: string) {
  return getRhythmSession(objectiveId, date);
}

export async function fetchRhythmSessions(objectiveId: string) {
  return listRhythmSessionsForObjective(objectiveId);
}

export async function fetchRhythmEffortCalendar(objectiveId: string) {
  return getRhythmEffortCalendarStats(objectiveId);
}

export async function fetchRhythmAggregates(objectiveId: string) {
  const [allTime, last5] = await Promise.all([
    computeRhythmAggregates(objectiveId),
    computeRhythmAggregates(objectiveId, { lastN: 5 }),
  ]);
  return { allTime, last5 };
}

export async function saveRhythmSession(
  objectiveId: string,
  date: string,
  payload: RhythmSessionPayload,
) {
  await upsertRhythmSession(objectiveId, date, payload);
  revalidate();
}

export async function saveRhythmDayState(
  objectiveId: string,
  date: string,
  day: RhythmDayState,
) {
  await upsertRhythmSession(objectiveId, date, dayStateToPayload(day));
  revalidate();
}

export async function removeRhythmSession(objectiveId: string, date: string) {
  await deleteRhythmSession(objectiveId, date);
  revalidate();
}

function nowHhmmLocal(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

/** Ctrl+Shift+digit: set today's complete sand cycles (1–9); partials preserved. */
export async function quickSetTodayCompleteCycles(
  objectiveId: string,
  completeCount: number,
): Promise<{ date: string; completeCount: number; effectiveMinutes: number }> {
  if (!objectiveId) throw new Error("No study cycle selected.");
  if (!Number.isInteger(completeCount) || completeCount < 1 || completeCount > 9) {
    throw new Error("Complete cycles must be 1–9.");
  }

  const date = todayString();
  const defaults = await fetchRhythmDayDefaults(objectiveId, date);
  const existing = await getRhythmSession(objectiveId, date);

  let day: RhythmDayState;
  if (existing) {
    day = recordToDayState(existing);
  } else {
    day = {
      startTime: nowHhmmLocal(),
      endTime: nowHhmmLocal(),
      startTimeConfirmed: false,
      endTimeConfirmed: false,
      startsWithOddCycle: defaults.startsWithOddCycle,
      continuedFromPreviousDay: defaults.continuedFromPreviousDay,
      entries: [],
    };
  }

  const structure = parseDayFlipStructure(day.entries);
  const entries = buildDayFlipEntries(
    {
      startPartialTenths: structure.startPartialTenths,
      completeCount,
      endPartialLowerTenths: structure.endPartialLowerTenths,
    },
    day.entries,
  );

  const next: RhythmDayState = { ...day, entries };
  await upsertRhythmSession(objectiveId, date, dayStateToPayload(next));

  const cfg = await resolveRhythmConfigForObjective(objectiveId);
  const effectiveMinutes = rhythmEffectiveFromEntries(
    next.startsWithOddCycle,
    entries,
    cfg,
  );

  revalidate();
  revalidatePath("/");

  return { date, completeCount, effectiveMinutes };
}

export async function fetchRhythmDayDefaults(objectiveId: string, date: string) {
  const prevDate = previousDateString(date);
  const prev = await getRhythmSession(objectiveId, prevDate);
  if (!prev) {
    return {
      startsWithOddCycle: true,
      carryRemainingTenths: 0,
      continuedFromPreviousDay: false,
    };
  }
  const day = recordToDayState(prev);
  if (day.entries.length > 0) {
    const { nextStartsOdd, endRemainingTenths } = endStateFromEntries(
      day.startsWithOddCycle,
      day.entries,
    );
    return {
      startsWithOddCycle: nextStartsOdd,
      carryRemainingTenths: endRemainingTenths,
      continuedFromPreviousDay: endRemainingTenths > 0,
    };
  }
  const carryRemainingTenths = defaultStartPartialTenthsFromPrevious(prev);
  const startsWithOddCycle = defaultStartsWithOddFromPrevious(prev);
  return {
    startsWithOddCycle,
    carryRemainingTenths,
    continuedFromPreviousDay: carryRemainingTenths > 0,
  };
}

export async function fetchRhythmDayNote(objectiveId: string, date: string) {
  const db = getDb();
  const row = await db.query.rhythmDayNotes.findFirst({
    where: and(
      eq(rhythmDayNotes.objectiveId, objectiveId),
      eq(rhythmDayNotes.date, date),
    ),
  });
  const body = row?.body?.trim();
  return body ? body : null;
}

export async function upsertRhythmDayNote(input: {
  objectiveId: string;
  date: string;
  body: string;
}) {
  const db = getDb();
  const objective = await db.query.objectives.findFirst({
    where: eq(objectives.id, input.objectiveId),
  });
  if (!objective) throw new Error("Objective not found");
  assertWritable(objective);
  const { objectiveStart, objectiveEnd } = await getObjectivePhaseBounds(
    input.objectiveId,
  );
  if (!isDateInRange(input.date, objectiveStart, objectiveEnd)) {
    throw new Error("Date is outside this study cycle.");
  }

  const trimmed = input.body.trim();
  const existing = await db.query.rhythmDayNotes.findFirst({
    where: and(
      eq(rhythmDayNotes.objectiveId, input.objectiveId),
      eq(rhythmDayNotes.date, input.date),
    ),
  });

  if (!trimmed) {
    if (existing) {
      await db.delete(rhythmDayNotes).where(eq(rhythmDayNotes.id, existing.id));
    }
    revalidate();
    return;
  }

  if (existing) {
    await db
      .update(rhythmDayNotes)
      .set({ body: trimmed, updatedAt: nowIso() })
      .where(eq(rhythmDayNotes.id, existing.id));
  } else {
    await db.insert(rhythmDayNotes).values({
      id: newId(),
      objectiveId: input.objectiveId,
      date: input.date,
      body: trimmed,
      updatedAt: nowIso(),
    });
  }
  revalidate();
}
