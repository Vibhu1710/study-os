import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { objectives, phases } from "@/db/schema";
import { isDateInRange, toDateString } from "@/lib/dates";
import {
  assertCanCompleteOnDay,
  assertCanPlanOnDay,
  type PhaseBounds,
} from "@/lib/study-day";

export async function getObjectivePhaseBounds(
  objectiveId: string,
): Promise<{ objectiveStart: string; objectiveEnd: string; phase: PhaseBounds | null }> {
  const db = getDb();
  const objective = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  if (!objective) throw new Error("Objective not found");

  let phase: PhaseBounds | null = null;
  if (objective.currentPhaseId) {
    const p = await db.query.phases.findFirst({
      where: eq(phases.id, objective.currentPhaseId),
    });
    if (p) phase = { startDate: p.startDate, endDate: p.endDate };
  }

  return {
    objectiveStart: objective.startDate,
    objectiveEnd: objective.endDate,
    phase,
  };
}

export async function assertPlanDateForObjective(objectiveId: string, date: string) {
  const { objectiveStart, objectiveEnd, phase } = await getObjectivePhaseBounds(objectiveId);
  assertCanPlanOnDay(date, objectiveStart, objectiveEnd, phase);
}

export async function assertCompleteDateForObjective(objectiveId: string, date: string) {
  const { objectiveStart, objectiveEnd, phase } = await getObjectivePhaseBounds(objectiveId);
  assertCanCompleteOnDay(date, objectiveStart, objectiveEnd, phase);
}

/** Syllabus Edit log — backfill or move a log onto a strict past day (not today). */
export async function assertEditLogTargetDate(objectiveId: string, date: string) {
  const { objectiveStart, objectiveEnd } = await getObjectivePhaseBounds(objectiveId);
  const today = toDateString(new Date());
  if (!isDateInRange(date, objectiveStart, objectiveEnd)) {
    throw new Error("Date is outside this study cycle.");
  }
  if (date >= today) {
    throw new Error("Choose a past day before today.");
  }
}

/** Volatile edits (undo / reschedule) — only while the log is still on today. */
export async function assertHistoricalCompletionDate(objectiveId: string, date: string) {
  const { objectiveStart, objectiveEnd } = await getObjectivePhaseBounds(objectiveId);
  const today = toDateString(new Date());
  if (!isDateInRange(date, objectiveStart, objectiveEnd)) {
    throw new Error("Date is outside this study cycle.");
  }
  if (date > today) {
    throw new Error("Completion date cannot be in the future.");
  }
  if (date < today) {
    throw new Error("Past completion logs are locked.");
  }
}
