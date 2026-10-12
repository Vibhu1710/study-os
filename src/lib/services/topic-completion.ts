import { and, eq, isNull } from "drizzle-orm";
import { getDb, newId, nowIso } from "@/db";
import {
  completionEvents,
  subtopics,
  subjects,
  topics,
} from "@/db/schema";
import { isDateInRange } from "@/lib/dates";
import {
  assertCompleteDateForObjective,
  assertHistoricalCompletionDate,
} from "@/lib/services/phase-guard";
import { assertWritable } from "@/lib/objective-context";
import { isTopicComplete } from "@/lib/progress";
import { todayString } from "@/lib/study-day";

async function getTopicContext(topicId: string) {
  const db = getDb();
  const topic = await db.query.topics.findFirst({
    where: eq(topics.id, topicId),
    with: { subject: { with: { objective: true } }, subtopics: true },
  });
  if (!topic) throw new Error("Topic not found");
  return topic;
}

export async function completeSubtopic(
  subtopicId: string,
  date: string,
) {
  const db = getDb();
  const sub = await db.query.subtopics.findFirst({
    where: eq(subtopics.id, subtopicId),
    with: {
      topic: {
        with: { subject: { with: { objective: true } }, subtopics: true },
      },
    },
  });
  if (!sub) throw new Error("Subtopic not found");
  const objective = sub.topic.subject.objective;
  assertWritable(objective);
  if (!isDateInRange(date, objective.startDate, objective.endDate)) {
    throw new Error("Date is outside this objective's range.");
  }
  if (objective.status === "planned" && date < objective.startDate) {
    throw new Error("Completions are locked until the objective start date.");
  }
  await assertCompleteDateForObjective(objective.id, date);

  const existing = await db.query.completionEvents.findFirst({
    where: eq(completionEvents.subtopicId, subtopicId),
  });
  if (existing) return existing;

  await db.insert(completionEvents).values({
    id: newId(),
    objectiveId: objective.id,
    subjectId: sub.topic.subjectId,
    topicId: sub.topicId,
    subtopicId,
    date,
    weightSnapshot: sub.weight,
  });

  const today = todayString();
  if (date < today) {
    const ts = nowIso();
    await db
      .update(subtopics)
      .set({ completedAt: ts })
      .where(eq(subtopics.id, subtopicId));

    const refreshed = await db.query.topics.findFirst({
      where: eq(topics.id, sub.topicId),
      with: { subtopics: true },
    });
    if (refreshed && isTopicComplete(refreshed, refreshed.subtopics)) {
      await db
        .update(topics)
        .set({ completedAt: ts })
        .where(eq(topics.id, sub.topicId));
    }
  }

  return { ok: true };
}

export async function completeTopicWithoutSubtopics(topicId: string, date: string) {
  const topic = await getTopicContext(topicId);
  const objective = topic.subject.objective;
  assertWritable(objective);
  if (topic.subtopics.length > 0) {
    throw new Error("Topic has subtopics; complete subtopics individually.");
  }
  if (!isDateInRange(date, objective.startDate, objective.endDate)) {
    throw new Error("Date is outside this objective's range.");
  }
  await assertCompleteDateForObjective(objective.id, date);

  const db = getDb();
  const existing = await db.query.completionEvents.findFirst({
    where: and(eq(completionEvents.topicId, topicId), isNull(completionEvents.subtopicId)),
  });
  if (!existing) {
    await db.insert(completionEvents).values({
      id: newId(),
      objectiveId: objective.id,
      subjectId: topic.subjectId,
      topicId,
      subtopicId: null,
      date,
      weightSnapshot: topic.weight,
    });
  }

  const today = todayString();
  if (date < today) {
    const ts = nowIso();
    await db.update(topics).set({ completedAt: ts }).where(eq(topics.id, topicId));
  }
  return { ok: true };
}

export async function uncompleteSubtopic(subtopicId: string) {
  const db = getDb();
  const sub = await db.query.subtopics.findFirst({
    where: eq(subtopics.id, subtopicId),
    with: { topic: { with: { subject: { with: { objective: true } } } } },
  });
  if (!sub) throw new Error("Subtopic not found");
  assertWritable(sub.topic.subject.objective);

  const event = await db.query.completionEvents.findFirst({
    where: eq(completionEvents.subtopicId, subtopicId),
  });
  if (!event) return;

  const today = todayString();
  if (event.date < today) {
    await assertHistoricalCompletionDate(sub.topic.subject.objective.id, event.date);
  }

  await db.delete(completionEvents).where(eq(completionEvents.subtopicId, subtopicId));

  if (event.date < today) {
    await db
      .update(subtopics)
      .set({ completedAt: null })
      .where(eq(subtopics.id, subtopicId));
    await db
      .update(topics)
      .set({ completedAt: null })
      .where(eq(topics.id, sub.topicId));
  }
}

export async function uncompleteTopic(topicId: string) {
  const db = getDb();
  const topic = await getTopicContext(topicId);
  assertWritable(topic.subject.objective);

  if (topic.subtopics.length > 0) {
    throw new Error("Uncomplete subtopics individually for this topic.");
  }

  const event = await db.query.completionEvents.findFirst({
    where: and(eq(completionEvents.topicId, topicId), isNull(completionEvents.subtopicId)),
  });
  if (!event) return;

  const today = todayString();
  if (event.date < today) {
    await assertHistoricalCompletionDate(topic.subject.objective.id, event.date);
    await db
      .delete(completionEvents)
      .where(and(eq(completionEvents.topicId, topicId), isNull(completionEvents.subtopicId)));
    await db.update(topics).set({ completedAt: null }).where(eq(topics.id, topicId));
    return;
  }

  await db
    .delete(completionEvents)
    .where(and(eq(completionEvents.topicId, topicId), isNull(completionEvents.subtopicId)));
}

export async function clearTopicProgressOnDate(
  objectiveId: string,
  date: string,
  topicId: string,
) {
  const db = getDb();
  const events = await db.query.completionEvents.findMany({
    where: and(
      eq(completionEvents.objectiveId, objectiveId),
      eq(completionEvents.topicId, topicId),
      eq(completionEvents.date, date),
    ),
  });
  for (const ev of events) {
    if (ev.subtopicId) {
      await uncompleteSubtopic(ev.subtopicId);
    }
  }
  if (events.some((e) => !e.subtopicId)) {
    await uncompleteTopic(topicId);
  }
}

export async function rescheduleSubtopicCompletion(subtopicId: string, newDate: string) {
  const db = getDb();
  const sub = await db.query.subtopics.findFirst({
    where: eq(subtopics.id, subtopicId),
    with: { topic: { with: { subject: { with: { objective: true } } } } },
  });
  if (!sub) throw new Error("Subtopic not found");
  const objective = sub.topic.subject.objective;
  assertWritable(objective);
  if (!sub.completedAt) throw new Error("Subtopic is not completed.");

  const event = await db.query.completionEvents.findFirst({
    where: eq(completionEvents.subtopicId, subtopicId),
  });
  if (!event) throw new Error("Completion record not found.");

  await assertHistoricalCompletionDate(objective.id, newDate);

  await db
    .update(completionEvents)
    .set({ date: newDate })
    .where(eq(completionEvents.id, event.id));
}

export async function rescheduleTopicCompletion(topicId: string, newDate: string) {
  const topic = await getTopicContext(topicId);
  const objective = topic.subject.objective;
  assertWritable(objective);
  if (topic.subtopics.length > 0) {
    throw new Error("Reschedule subtopics individually for this topic.");
  }
  if (!topic.completedAt) throw new Error("Topic is not completed.");

  const db = getDb();
  const event = await db.query.completionEvents.findFirst({
    where: and(eq(completionEvents.topicId, topicId), isNull(completionEvents.subtopicId)),
  });
  if (!event) throw new Error("Completion record not found.");

  await assertHistoricalCompletionDate(objective.id, newDate);

  await db
    .update(completionEvents)
    .set({ date: newDate })
    .where(eq(completionEvents.id, event.id));
}
