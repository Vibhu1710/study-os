"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, newId, nowIso } from "@/db";
import {
  backlogItems,
  completionEvents,
  subtopics,
  subjects,
  topics,
} from "@/db/schema";
import { toDateString } from "@/lib/dates";
import { todayString } from "@/lib/study-day";
import {
  assertSubtopicCountValid,
  wouldLeaveSingleSubtopic,
} from "@/lib/syllabus-subtopics";
import { assertFinitePositiveWeight } from "@/lib/syllabus-weight-input";
import {
  assertWeightsSumTo,
  roundWeightTenth,
  spreadWeightsEvenly,
} from "@/lib/weight";
import { assertWritable } from "@/lib/objective-context";
import {
  syncLeafTopicCompletionSnapshots,
  syncSubtopicCompletionSnapshots,
} from "@/lib/services/completion-weight-sync";
import {
  completeSubtopic,
  completeTopicWithoutSubtopics,
  rescheduleSubtopicCompletion,
  rescheduleTopicCompletion,
  uncompleteSubtopic,
  uncompleteTopic,
} from "@/lib/services/topic-completion";

function revalidate() {
  revalidatePath("/");
  revalidatePath("/syllabus");
  revalidatePath("/dashboard");
  revalidatePath("/settings");
}

async function getWritableTopic(topicId: string) {
  const db = getDb();
  const topic = await db.query.topics.findFirst({
    where: eq(topics.id, topicId),
    with: { subject: { with: { objective: true } }, subtopics: true },
  });
  if (!topic) throw new Error("Topic not found");
  assertWritable(topic.subject.objective);
  return topic;
}

export async function createTopic(
  subjectId: string,
  input: { title: string; weight: number; notes?: string | null },
) {
  const db = getDb();
  const subject = await db.query.subjects.findFirst({
    where: eq(subjects.id, subjectId),
    with: { objective: true },
  });
  if (!subject) throw new Error("Subject not found");
  assertWritable(subject.objective);
  const weight = assertFinitePositiveWeight(input.weight, "Topic weight");
  const siblings = await db.query.topics.findMany({
    where: eq(topics.subjectId, subjectId),
  });
  const id = newId();
  await db.insert(topics).values({
    id,
    subjectId,
    title: input.title,
    weight,
    sortOrder: siblings.length,
    notes: input.notes?.trim() || null,
  });
  revalidate();
  return id;
}

export async function createTopicWithSubtopics(
  subjectId: string,
  input: { title: string; weight: number; notes?: string | null },
  subtopicsInput: { title: string; weight: number }[] = [],
) {
  const db = getDb();
  const subject = await db.query.subjects.findFirst({
    where: eq(subjects.id, subjectId),
    with: { objective: true },
  });
  if (!subject) throw new Error("Subject not found");
  assertWritable(subject.objective);

  const topicWeight = assertFinitePositiveWeight(input.weight, "Topic weight");
  const trimmed = subtopicsInput
    .map((s) => ({
      title: s.title.trim(),
      weight: assertFinitePositiveWeight(s.weight, "Subtopic weight"),
    }))
    .filter((s) => s.title.length > 0);
  if (trimmed.length > 0) {
    assertSubtopicCountValid(trimmed.length, "New topic");
    assertWeightsSumTo(topicWeight, trimmed.map((s) => s.weight));
  }

  const siblings = await db.query.topics.findMany({
    where: eq(topics.subjectId, subjectId),
  });
  const topicId = newId();
  await db.insert(topics).values({
    id: topicId,
    subjectId,
    title: input.title,
    weight: topicWeight,
    sortOrder: siblings.length,
    notes: input.notes?.trim() || null,
  });

  for (let i = 0; i < trimmed.length; i++) {
    const sub = trimmed[i];
    await db.insert(subtopics).values({
      id: newId(),
      topicId,
      title: sub.title,
      weight: sub.weight,
      sortOrder: i,
    });
  }

  revalidate();
  return topicId;
}

export async function updateTopic(
  id: string,
  input: Partial<{ title: string; weight: number; sortOrder: number; notes: string | null }>,
) {
  const topic = await getWritableTopic(id);
  const db = getDb();
  const patch = { ...input };
  if (topic.subtopics.length > 0) {
    delete patch.weight;
  } else if (patch.weight !== undefined) {
    patch.weight = assertFinitePositiveWeight(patch.weight, "Topic weight");
  }
  if (patch.notes !== undefined) {
    patch.notes = patch.notes?.trim() ? patch.notes.trim() : null;
  }
  if (Object.keys(patch).length === 0) return;
  await db.update(topics).set(patch).where(eq(topics.id, id));
  if (topic.subtopics.length > 0) {
    await setTopicWeightFromSubtopics(id);
  } else if (patch.weight !== undefined) {
    await syncLeafTopicCompletionSnapshots(id, patch.weight);
  }
  revalidate();
}

export async function deleteTopic(id: string) {
  await getWritableTopic(id);
  const db = getDb();
  await db.delete(topics).where(eq(topics.id, id));
  revalidate();
}

export async function createSubtopic(
  topicId: string,
  input: { title: string; weight: number; notes?: string | null },
) {
  const topic = await getWritableTopic(topicId);
  const db = getDb();
  const subs = topic.subtopics;
  if (subs.length === 0) {
    throw new Error(
      "Use “Split into subtopics” first — weights must sum exactly to the topic weight.",
    );
  }
  const weight = assertFinitePositiveWeight(input.weight, "Subtopic weight");
  const id = newId();
  await db.insert(subtopics).values({
    id,
    topicId,
    title: input.title,
    weight,
    sortOrder: subs.length,
    notes: input.notes?.trim() || null,
  });
  await db
    .update(topics)
    .set({ completedAt: null })
    .where(eq(topics.id, topicId));
  await setTopicWeightFromSubtopics(topicId);
  revalidate();
  return id;
}

/** First-time split of a topic (no subtopics yet). Weights must sum exactly to topic weight. */
export async function splitTopicIntoSubtopics(
  topicId: string,
  items: { title: string; weight: number }[],
) {
  const topic = await getWritableTopic(topicId);
  if (topic.subtopics.length > 0) {
    throw new Error("Topic already has subtopics — add more from the subtopic list.");
  }
  const trimmed = items
    .map((i) => ({
      title: i.title.trim(),
      weight: assertFinitePositiveWeight(i.weight, "Subtopic weight"),
    }))
    .filter((i) => i.title.length > 0);
  if (trimmed.length === 0) throw new Error("Add at least two subtopics to split.");
  assertSubtopicCountValid(trimmed.length, "Split topic");
  assertWeightsSumTo(topic.weight, trimmed.map((i) => i.weight));

  const db = getDb();
  const wasComplete = Boolean(topic.completedAt);
  let completionDate: string | null = null;
  if (wasComplete) {
    const ev = await db.query.completionEvents.findFirst({
      where: and(
        eq(completionEvents.topicId, topicId),
        isNull(completionEvents.subtopicId),
      ),
    });
    completionDate = ev?.date ?? toDateString(new Date());
  }
  const ts = topic.completedAt ?? nowIso();

  for (let i = 0; i < trimmed.length; i++) {
    const row = trimmed[i];
    const subId = newId();
    await db.insert(subtopics).values({
      id: subId,
      topicId,
      title: row.title,
      weight: row.weight,
      sortOrder: i,
      completedAt: wasComplete ? ts : null,
    });
    if (wasComplete && completionDate) {
      await db.insert(completionEvents).values({
        id: newId(),
        objectiveId: topic.subject.objective.id,
        subjectId: topic.subjectId,
        topicId,
        subtopicId: subId,
        date: completionDate,
        weightSnapshot: row.weight,
      });
    }
  }

  if (wasComplete) {
    await db
      .delete(completionEvents)
      .where(
        and(eq(completionEvents.topicId, topicId), isNull(completionEvents.subtopicId)),
      );
    await db.update(topics).set({ completedAt: ts }).where(eq(topics.id, topicId));
  } else {
    await db.update(topics).set({ completedAt: null }).where(eq(topics.id, topicId));
  }
  revalidate();
}

export async function updateSubtopic(
  id: string,
  input: Partial<{ title: string; weight: number; sortOrder: number; notes: string | null }>,
) {
  const db = getDb();
  const sub = await db.query.subtopics.findFirst({
    where: eq(subtopics.id, id),
    with: { topic: { with: { subject: { with: { objective: true } }, subtopics: true } } },
  });
  if (!sub) throw new Error("Subtopic not found");
  assertWritable(sub.topic.subject.objective);

  const patch = { ...input };
  if (patch.weight !== undefined) {
    patch.weight = assertFinitePositiveWeight(patch.weight, "Subtopic weight");
  }
  if (patch.notes !== undefined) {
    patch.notes = patch.notes?.trim() ? patch.notes.trim() : null;
  }
  await db.update(subtopics).set(patch).where(eq(subtopics.id, id));
  if (patch.weight !== undefined) {
    await syncSubtopicCompletionSnapshots(id, patch.weight);
    await setTopicWeightFromSubtopics(sub.topicId);
  }
  revalidate();
}

export async function deleteSubtopic(id: string) {
  const db = getDb();
  const sub = await db.query.subtopics.findFirst({
    where: eq(subtopics.id, id),
    with: { topic: { with: { subject: { with: { objective: true } } } } },
  });
  if (!sub) return;
  assertWritable(sub.topic.subject.objective);
  const siblingCount = await db.query.subtopics.findMany({
    where: eq(subtopics.topicId, sub.topicId),
  });
  if (wouldLeaveSingleSubtopic(siblingCount.length, 1)) {
    throw new Error(
      "Cannot leave a single subtopic — add another or remove both to keep a leaf topic.",
    );
  }
  await db.delete(subtopics).where(eq(subtopics.id, id));
  revalidate();
}

/** Remove every subtopic on a topic (collapse back to a leaf). */
export async function deleteAllSubtopicsFromTopic(topicId: string) {
  const topic = await getWritableTopic(topicId);
  const db = getDb();
  for (const s of topic.subtopics) {
    await db.delete(subtopics).where(eq(subtopics.id, s.id));
  }
  revalidate();
}

export async function rebalanceSubtopicsEvenly(topicId: string) {
  const topic = await getWritableTopic(topicId);
  const db = getDb();
  const subs = topic.subtopics;
  if (subs.length === 0) return;
  const weights = spreadWeightsEvenly(topic.weight, subs.length);
  for (let i = 0; i < subs.length; i++) {
    const w = weights[i] ?? subs[i].weight;
    await db.update(subtopics).set({ weight: w }).where(eq(subtopics.id, subs[i].id));
    await syncSubtopicCompletionSnapshots(subs[i].id, w);
  }
  revalidate();
}

export async function setTopicWeightFromSubtopics(topicId: string) {
  const topic = await getWritableTopic(topicId);
  const sum = roundWeightTenth(
    topic.subtopics.reduce((s, x) => s + x.weight, 0),
  );
  const db = getDb();
  await db.update(topics).set({ weight: sum }).where(eq(topics.id, topicId));
  revalidate();
}

export async function reorderSubtopics(topicId: string, orderedIds: string[]) {
  const topic = await getWritableTopic(topicId);
  const existing = new Set(topic.subtopics.map((s) => s.id));
  if (orderedIds.length !== existing.size) {
    throw new Error("Subtopic order must include every row.");
  }
  for (const id of orderedIds) {
    if (!existing.has(id)) throw new Error("Invalid subtopic in order list.");
  }
  const db = getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(subtopics)
      .set({ sortOrder: i })
      .where(eq(subtopics.id, orderedIds[i]!));
  }
  revalidate();
}

/** After user mutations — revalidate cached routes. */
export async function syncTopicWeightsFromSubtopicsForObjective(
  objectiveId: string,
) {
  const { normalizeTopicWeightsForObjective } = await import(
    "@/lib/syllabus-weight-normalize"
  );
  const changed = await normalizeTopicWeightsForObjective(objectiveId);
  if (changed) revalidate();
}

export async function rescheduleCompletion(
  topicId: string,
  subtopicId: string | null,
  newDate: string,
) {
  if (newDate !== todayString()) {
    throw new Error("Completion dates cannot be changed after the day has passed.");
  }
  if (subtopicId) {
    await rescheduleSubtopicCompletion(subtopicId, newDate);
  } else {
    await rescheduleTopicCompletion(topicId, newDate);
  }
  revalidate();
}

export async function togglePlanItemComplete(
  topicId: string,
  subtopicId: string | null,
  date: string,
  complete: boolean,
) {
  if (date !== todayString()) {
    throw new Error("Completions can only be changed on today's date.");
  }
  if (complete) {
    if (subtopicId) await completeSubtopic(subtopicId, date);
    else await completeTopicWithoutSubtopics(topicId, date);
  } else {
    if (subtopicId) await uncompleteSubtopic(subtopicId);
    else await uncompleteTopic(topicId);
  }
  revalidate();
}

export async function promoteBacklogItem(
  backlogId: string,
  weight: number,
) {
  const validWeight = assertFinitePositiveWeight(weight, "Topic weight");
  const db = getDb();
  const item = await db.query.backlogItems.findFirst({
    where: eq(backlogItems.id, backlogId),
    with: { subject: { with: { objective: true } } },
  });
  if (!item) throw new Error("Backlog item not found");
  assertWritable(item.subject.objective);
  const topicId = await createTopic(item.subjectId, {
    title: item.title,
    weight: validWeight,
  });
  await db.delete(backlogItems).where(eq(backlogItems.id, backlogId));
  revalidate();
  return topicId;
}

export async function createBacklogItem(
  subjectId: string,
  input: { title: string; notes?: string },
) {
  const db = getDb();
  const subject = await db.query.subjects.findFirst({
    where: eq(subjects.id, subjectId),
    with: { objective: true },
  });
  if (!subject) throw new Error("Subject not found");
  assertWritable(subject.objective);
  const items = await db.query.backlogItems.findMany({
    where: eq(backlogItems.subjectId, subjectId),
  });
  const id = newId();
  await db.insert(backlogItems).values({
    id,
    subjectId,
    title: input.title,
    notes: input.notes ?? null,
    sortOrder: items.length,
    createdAt: nowIso(),
  });
  revalidate();
  return id;
}

export async function deleteBacklogItem(id: string) {
  const db = getDb();
  const item = await db.query.backlogItems.findFirst({
    where: eq(backlogItems.id, id),
    with: { subject: { with: { objective: true } } },
  });
  if (!item) return;
  assertWritable(item.subject.objective);
  await db.delete(backlogItems).where(eq(backlogItems.id, id));
  revalidate();
}
