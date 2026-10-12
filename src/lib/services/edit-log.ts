import { and, eq, isNull } from "drizzle-orm";
import { getDb, newId, nowIso } from "@/db";
import { completionEvents, subtopics, topics } from "@/db/schema";
import { isDateInRange } from "@/lib/dates";
import { assertEditLogTargetDate } from "@/lib/services/phase-guard";
import { assertWritable } from "@/lib/objective-context";
import { isTopicComplete } from "@/lib/progress";
import {
  findTopicScheduledDates,
  unscheduleTopicFromAllUpcomingDays,
} from "@/lib/services/day-assignment";
import { todayString } from "@/lib/study-day";

export type EditLogSaveResult = {
  topicBecameComplete: boolean;
  clearedScheduleDate: string | null;
};

async function loadTopicForEditLog(topicId: string) {
  const db = getDb();
  const topic = await db.query.topics.findFirst({
    where: eq(topics.id, topicId),
    with: {
      subject: { with: { objective: true } },
      subtopics: {
        orderBy: (st, { asc }) => [asc(st.sortOrder)],
      },
    },
  });
  if (!topic) throw new Error("Topic not found");
  assertWritable(topic.subject.objective);
  return topic;
}

/** Align completed_at with committed completion_events (past days only). */
export async function syncTopicCompletionFromEvents(topicId: string) {
  const db = getDb();
  const topic = await db.query.topics.findFirst({
    where: eq(topics.id, topicId),
    with: { subtopics: true },
  });
  if (!topic) return;

  const today = todayString();
  const events = await db.query.completionEvents.findMany({
    where: eq(completionEvents.topicId, topicId),
  });
  const eventBySubId = new Map(
    events.filter((e) => e.subtopicId).map((e) => [e.subtopicId!, e]),
  );
  const leafEvent = events.find((e) => !e.subtopicId);

  const ts = nowIso();

  if (topic.subtopics.length === 0) {
    if (leafEvent && leafEvent.date < today) {
      if (!topic.completedAt) {
        await db.update(topics).set({ completedAt: ts }).where(eq(topics.id, topicId));
      }
    } else if (!leafEvent) {
      await db.update(topics).set({ completedAt: null }).where(eq(topics.id, topicId));
    }
    return;
  }

  for (const sub of topic.subtopics) {
    const ev = eventBySubId.get(sub.id);
    if (ev && ev.date < today) {
      if (!sub.completedAt) {
        await db
          .update(subtopics)
          .set({ completedAt: ts })
          .where(eq(subtopics.id, sub.id));
      }
    } else if (!ev) {
      if (sub.completedAt) {
        await db
          .update(subtopics)
          .set({ completedAt: null })
          .where(eq(subtopics.id, sub.id));
      }
    }
  }

  const refreshed = await db.query.topics.findFirst({
    where: eq(topics.id, topicId),
    with: { subtopics: true },
  });
  if (!refreshed) return;

  if (isTopicComplete(refreshed, refreshed.subtopics)) {
    if (!refreshed.completedAt) {
      await db.update(topics).set({ completedAt: ts }).where(eq(topics.id, topicId));
    }
  } else {
    await db.update(topics).set({ completedAt: null }).where(eq(topics.id, topicId));
  }
}

async function maybeUnscheduleOnComplete(
  objectiveId: string,
  topicId: string,
  wasComplete: boolean,
): Promise<EditLogSaveResult> {
  const db = getDb();
  const topic = await db.query.topics.findFirst({
    where: eq(topics.id, topicId),
    with: { subtopics: true },
  });
  if (!topic) {
    return { topicBecameComplete: false, clearedScheduleDate: null };
  }

  const nowComplete = isTopicComplete(topic, topic.subtopics);
  if (!nowComplete || wasComplete) {
    return { topicBecameComplete: false, clearedScheduleDate: null };
  }

  const today = todayString();
  const scheduled = await findTopicScheduledDates(objectiveId, topicId);
  const upcoming = scheduled.filter((d) => d >= today).sort();
  const clearedScheduleDate = upcoming[0] ?? null;

  await unscheduleTopicFromAllUpcomingDays(objectiveId, topicId);

  return { topicBecameComplete: true, clearedScheduleDate };
}

export async function editLogBackfillSubtopic(
  subtopicId: string,
  date: string,
): Promise<EditLogSaveResult> {
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
  await assertEditLogTargetDate(objective.id, date);

  const wasComplete = isTopicComplete(sub.topic, sub.topic.subtopics);

  const existing = await db.query.completionEvents.findFirst({
    where: eq(completionEvents.subtopicId, subtopicId),
  });
  if (existing) {
    throw new Error("This subtopic already has a log. Use change date instead.");
  }

  await db.insert(completionEvents).values({
    id: newId(),
    objectiveId: objective.id,
    subjectId: sub.topic.subjectId,
    topicId: sub.topicId,
    subtopicId,
    date,
    weightSnapshot: sub.weight,
  });

  await syncTopicCompletionFromEvents(sub.topicId);
  return maybeUnscheduleOnComplete(objective.id, sub.topicId, wasComplete);
}

export async function editLogBackfillLeafTopic(
  topicId: string,
  date: string,
): Promise<EditLogSaveResult> {
  const topic = await loadTopicForEditLog(topicId);
  if (topic.subtopics.length > 0) {
    throw new Error("Complete subtopics individually.");
  }
  const objective = topic.subject.objective;
  if (!isDateInRange(date, objective.startDate, objective.endDate)) {
    throw new Error("Date is outside this objective's range.");
  }
  await assertEditLogTargetDate(objective.id, date);

  const wasComplete = Boolean(topic.completedAt);
  const db = getDb();
  const existing = await db.query.completionEvents.findFirst({
    where: and(eq(completionEvents.topicId, topicId), isNull(completionEvents.subtopicId)),
  });
  if (existing) {
    throw new Error("This topic already has a log. Use change date instead.");
  }

  await db.insert(completionEvents).values({
    id: newId(),
    objectiveId: objective.id,
    subjectId: topic.subjectId,
    topicId,
    subtopicId: null,
    date,
    weightSnapshot: topic.weight,
  });

  await syncTopicCompletionFromEvents(topicId);
  return maybeUnscheduleOnComplete(objective.id, topicId, wasComplete);
}

export async function editLogRelogSubtopic(
  subtopicId: string,
  newDate: string,
): Promise<EditLogSaveResult> {
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
  await assertEditLogTargetDate(objective.id, newDate);

  const wasComplete = isTopicComplete(sub.topic, sub.topic.subtopics);

  const event = await db.query.completionEvents.findFirst({
    where: eq(completionEvents.subtopicId, subtopicId),
  });
  if (!event) {
    throw new Error("No log to change. Add a log first.");
  }

  await db
    .update(completionEvents)
    .set({ date: newDate })
    .where(eq(completionEvents.id, event.id));

  await syncTopicCompletionFromEvents(sub.topicId);
  return maybeUnscheduleOnComplete(objective.id, sub.topicId, wasComplete);
}

export async function editLogRelogLeafTopic(
  topicId: string,
  newDate: string,
): Promise<EditLogSaveResult> {
  const topic = await loadTopicForEditLog(topicId);
  if (topic.subtopics.length > 0) {
    throw new Error("Change subtopic logs individually.");
  }
  const objective = topic.subject.objective;
  await assertEditLogTargetDate(objective.id, newDate);

  const wasComplete = Boolean(topic.completedAt);
  const db = getDb();
  const event = await db.query.completionEvents.findFirst({
    where: and(eq(completionEvents.topicId, topicId), isNull(completionEvents.subtopicId)),
  });
  if (!event) throw new Error("No log to change. Add a log first.");

  await db
    .update(completionEvents)
    .set({ date: newDate })
    .where(eq(completionEvents.id, event.id));

  await syncTopicCompletionFromEvents(topicId);
  return maybeUnscheduleOnComplete(objective.id, topicId, wasComplete);
}

export async function editLogRemoveSubtopic(
  subtopicId: string,
): Promise<EditLogSaveResult> {
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
  assertWritable(sub.topic.subject.objective);

  const wasComplete = isTopicComplete(sub.topic, sub.topic.subtopics);

  const event = await db.query.completionEvents.findFirst({
    where: eq(completionEvents.subtopicId, subtopicId),
  });
  if (!event) return { topicBecameComplete: false, clearedScheduleDate: null };

  await db.delete(completionEvents).where(eq(completionEvents.subtopicId, subtopicId));
  await db
    .update(subtopics)
    .set({ completedAt: null })
    .where(eq(subtopics.id, subtopicId));

  await syncTopicCompletionFromEvents(sub.topicId);
  return maybeUnscheduleOnComplete(sub.topic.subject.objective.id, sub.topicId, wasComplete);
}

export async function editLogRemoveLeafTopic(
  topicId: string,
): Promise<EditLogSaveResult> {
  const topic = await loadTopicForEditLog(topicId);
  if (topic.subtopics.length > 0) {
    throw new Error("Remove subtopic logs individually.");
  }

  const wasComplete = Boolean(topic.completedAt);
  const db = getDb();
  const event = await db.query.completionEvents.findFirst({
    where: and(eq(completionEvents.topicId, topicId), isNull(completionEvents.subtopicId)),
  });
  if (!event) return { topicBecameComplete: false, clearedScheduleDate: null };

  await db
    .delete(completionEvents)
    .where(and(eq(completionEvents.topicId, topicId), isNull(completionEvents.subtopicId)));
  await db.update(topics).set({ completedAt: null }).where(eq(topics.id, topicId));

  return maybeUnscheduleOnComplete(topic.subject.objective.id, topicId, wasComplete);
}

/** Upcoming plan date for confirm copy (today or next future). */
export async function editLogUpcomingScheduleDate(
  objectiveId: string,
  topicId: string,
): Promise<string | null> {
  const today = todayString();
  const dates = await findTopicScheduledDates(objectiveId, topicId);
  const upcoming = dates.filter((d) => d >= today).sort();
  return upcoming[0] ?? null;
}
