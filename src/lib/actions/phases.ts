"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, newId } from "@/db";
import { objectives, phaseTopics, phases, subjects, topics } from "@/db/schema";
import {
  inclusiveDayCount,
  isDateInRange,
  minDateString,
  toDateString,
} from "@/lib/dates";
import { assertWritable } from "@/lib/objective-context";
import {
  assertNoLivePhase,
  getCurrentPhaseRecord,
  isPhaseEndedByDate,
  parsePendingPhaseTopicIds,
  syncPhaseForObjective,
} from "@/lib/phase-lifecycle";
import { isTopicComplete } from "@/lib/progress";
import { topicBlocksDephase } from "@/lib/progress-projection";
import { fetchVolatileTodayKeys } from "@/lib/progress-projection-server";
import { reconcilePhaseSchedulesWithBounds } from "@/lib/services/phase-schedule-reconcile";
import { unscheduleTopicFromAllUpcomingDays } from "@/lib/services/day-assignment";

function revalidate() {
  revalidatePath("/");
  revalidatePath("/syllabus");
  revalidatePath("/dashboard");
}

function assertPhaseSpan(startDate: string, endDate: string) {
  if (inclusiveDayCount(startDate, endDate) < 1) {
    throw new Error("Phase must include at least one day.");
  }
}

export async function createPhase(
  objectiveId: string,
  input: {
    name: string;
    startDate: string;
    endDate: string;
    topicIds?: string[];
  },
) {
  const today = toDateString(new Date());
  await syncPhaseForObjective(objectiveId);
  await assertNoLivePhase(objectiveId);

  const db = getDb();
  const objective = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  if (!objective) throw new Error("Objective not found");
  assertWritable(objective);

  if (input.startDate < today) {
    throw new Error("Phase start cannot be before today.");
  }
  if (isPhaseEndedByDate(input.endDate, today)) {
    throw new Error("End date must be today or later.");
  }
  if (
    !isDateInRange(input.startDate, objective.startDate, objective.endDate) ||
    !isDateInRange(input.endDate, objective.startDate, objective.endDate)
  ) {
    throw new Error("Phase dates must fall within the study cycle range.");
  }
  if (input.startDate > input.endDate) {
    throw new Error("Invalid phase date range.");
  }
  assertPhaseSpan(input.startDate, input.endDate);

  const topicIds =
    input.topicIds ??
    parsePendingPhaseTopicIds(objective.pendingPhaseTopicIds);

  const validatedIds: string[] = [];
  for (const topicId of topicIds) {
    const t = await db.query.topics.findFirst({
      where: eq(topics.id, topicId),
      with: { subtopics: true, subject: true },
    });
    if (!t || t.subject.objectiveId !== objectiveId) continue;
    if (isTopicComplete(t, t.subtopics)) continue;
    validatedIds.push(topicId);
  }

  const id = newId();
  await db.insert(phases).values({
    id,
    objectiveId,
    name: input.name.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    sortOrder: 0,
  });

  for (const topicId of validatedIds) {
    await db.insert(phaseTopics).values({ phaseId: id, topicId });
  }

  await db
    .update(objectives)
    .set({ currentPhaseId: id, pendingPhaseTopicIds: null })
    .where(eq(objectives.id, objectiveId));

  revalidate();
  return id;
}

export async function getPendingPhaseTopicIdsForObjective(objectiveId: string) {
  const db = getDb();
  const objective = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  if (!objective) return [];
  return parsePendingPhaseTopicIds(objective.pendingPhaseTopicIds);
}

export async function updateCurrentPhase(
  objectiveId: string,
  input: {
    name: string;
    startDate: string;
    endDate: string;
    topicIds: string[];
  },
) {
  const today = toDateString(new Date());
  await syncPhaseForObjective(objectiveId);
  const phase = await getCurrentPhaseRecord(objectiveId);
  if (!phase) throw new Error("No active phase to edit.");

  const db = getDb();
  const objective = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  if (!objective) throw new Error("Objective not found");
  assertWritable(objective);

  const earliestStart = minDateString(today, phase.startDate);
  if (input.startDate < earliestStart) {
    throw new Error(
      "Phase start cannot move earlier than when this sprint began (or earlier than today).",
    );
  }
  if (isPhaseEndedByDate(input.endDate, today)) {
    throw new Error("End date must be today or later while the phase is active.");
  }
  if (
    !isDateInRange(input.startDate, objective.startDate, objective.endDate) ||
    !isDateInRange(input.endDate, objective.startDate, objective.endDate)
  ) {
    throw new Error("Phase dates must fall within the study cycle range.");
  }
  if (input.startDate > input.endDate) throw new Error("Invalid phase date range.");
  assertPhaseSpan(input.startDate, input.endDate);
  const existingPhaseTopics = await db.query.phaseTopics.findMany({
    where: eq(phaseTopics.phaseId, phase.id),
    columns: { topicId: true },
  });
  const previousTopicIds = existingPhaseTopics.map((r) => r.topicId);

  await db
    .update(phases)
    .set({
      name: input.name.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
    })
    .where(eq(phases.id, phase.id));

  await db.delete(phaseTopics).where(eq(phaseTopics.phaseId, phase.id));
  for (const topicId of input.topicIds) {
    await db.insert(phaseTopics).values({ phaseId: phase.id, topicId });
  }

  const removedTopicIds = previousTopicIds.filter(
    (id) => !input.topicIds.includes(id),
  );
  await reconcilePhaseSchedulesWithBounds(
    objectiveId,
    input.startDate,
    input.endDate,
    input.topicIds,
    { removedFromPhaseTopicIds: removedTopicIds },
  );

  revalidate();
}

export async function addTopicsToPhase(phaseId: string, topicIds: string[]) {
  const db = getDb();
  const phase = await db.query.phases.findFirst({
    where: eq(phases.id, phaseId),
    with: { objective: true },
  });
  if (!phase) throw new Error("Phase not found");
  assertWritable(phase.objective);
  for (const topicId of topicIds) {
    try {
      await db.insert(phaseTopics).values({ phaseId, topicId });
    } catch {
      /* already assigned */
    }
  }
  revalidate();
}

export async function removeTopicFromPhase(phaseId: string, topicId: string) {
  const db = getDb();
  const phase = await db.query.phases.findFirst({
    where: eq(phases.id, phaseId),
    with: { objective: true },
  });
  if (!phase) throw new Error("Phase not found");
  assertWritable(phase.objective);

  const topic = await db.query.topics.findFirst({
    where: eq(topics.id, topicId),
    with: { subtopics: true },
  });
  if (!topic) throw new Error("Topic not found");

  const volatile = await fetchVolatileTodayKeys(phase.objectiveId);
  if (topicBlocksDephase(topic, topic.subtopics, volatile)) {
    const hasSubs = topic.subtopics.length > 0;
    throw new Error(
      hasSubs
        ? "Cannot remove this topic from the phase — subtopics are checked today (not committed yet)."
        : "Cannot remove this topic from the phase — work has already started (including today's checks).",
    );
  }

  await unscheduleTopicFromAllUpcomingDays(phase.objectiveId, topicId);

  await db
    .delete(phaseTopics)
    .where(and(eq(phaseTopics.phaseId, phaseId), eq(phaseTopics.topicId, topicId)));
  revalidate();
}

export async function getPhaseWithTopics(phaseId: string) {
  const db = getDb();
  return db.query.phases.findFirst({
    where: eq(phases.id, phaseId),
    with: {
      phaseTopics: {
        with: {
          topic: { with: { subject: true, subtopics: true } },
        },
      },
    },
  });
}
