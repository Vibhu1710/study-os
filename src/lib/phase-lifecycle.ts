import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { objectives, phaseTopics, phases } from "@/db/schema";
import { toDateString } from "@/lib/dates";
import { isTopicComplete } from "@/lib/progress";

export function parsePendingPhaseTopicIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Phase sprint has ended — last day of range is still in the phase. */
export function isPhaseEndedByDate(
  endDate: string,
  today: string = toDateString(new Date()),
): boolean {
  return today > endDate;
}

export function isPhaseLiveByDate(
  startDate: string,
  endDate: string,
  today: string = toDateString(new Date()),
): boolean {
  return today >= startDate && today <= endDate;
}

/** Drop ended phases (no history); clear pointer on objective. */
export async function syncPhaseForObjective(objectiveId: string) {
  const db = getDb();
  const today = toDateString(new Date());
  const objective = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  if (!objective?.currentPhaseId) return;

  const phase = await db.query.phases.findFirst({
    where: eq(phases.id, objective.currentPhaseId),
  });
  if (!phase || isPhaseEndedByDate(phase.endDate, today)) {
    if (phase) {
      const pts = await db.query.phaseTopics.findMany({
        where: eq(phaseTopics.phaseId, phase.id),
        with: { topic: { with: { subtopics: true } } },
      });
      const residue: string[] = [];
      for (const pt of pts) {
        if (!isTopicComplete(pt.topic, pt.topic.subtopics)) {
          residue.push(pt.topicId);
        }
      }
      await db
        .update(objectives)
        .set({
          pendingPhaseTopicIds: JSON.stringify(residue),
          currentPhaseId: null,
        })
        .where(eq(objectives.id, objectiveId));
      await db.delete(phases).where(eq(phases.id, phase.id));
    } else {
      await db
        .update(objectives)
        .set({ currentPhaseId: null })
        .where(eq(objectives.id, objectiveId));
    }
  }
}

export async function getCurrentPhaseRecord(objectiveId: string) {
  await syncPhaseForObjective(objectiveId);
  const db = getDb();
  const objective = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  if (!objective?.currentPhaseId) return null;
  return db.query.phases.findFirst({
    where: eq(phases.id, objective.currentPhaseId),
  });
}

export async function assertNoLivePhase(objectiveId: string) {
  const phase = await getCurrentPhaseRecord(objectiveId);
  if (phase) {
    throw new Error(
      `A phase is already active (“${phase.name}” until ${phase.endDate}). Set a new one only after it ends.`,
    );
  }
}
