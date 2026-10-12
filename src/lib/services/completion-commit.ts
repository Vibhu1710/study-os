import { and, eq, inArray } from "drizzle-orm";
import { getDb, nowIso } from "@/db";
import {
  completionEvents,
  objectives,
  subtopics,
  subjects,
  topics,
} from "@/db/schema";
import { todayString } from "@/lib/study-day";
import { isTopicComplete } from "@/lib/progress";

/** Apply completion_events before today onto topic/subtopic completed_at. */
export async function commitCompletionsForDate(objectiveId: string, date: string) {
  const today = todayString();
  if (date >= today) return;

  const db = getDb();
  const events = await db.query.completionEvents.findMany({
    where: and(
      eq(completionEvents.objectiveId, objectiveId),
      eq(completionEvents.date, date),
    ),
  });
  if (events.length === 0) return;

  const ts = nowIso();
  for (const ev of events) {
    if (ev.subtopicId) {
      await db
        .update(subtopics)
        .set({ completedAt: ts })
        .where(eq(subtopics.id, ev.subtopicId));
    }
  }
  for (const ev of events) {
    if (!ev.subtopicId) {
      await db.update(topics).set({ completedAt: ts }).where(eq(topics.id, ev.topicId));
    }
  }

  const topicIds = [...new Set(events.map((e) => e.topicId))];
  for (const topicId of topicIds) {
    const topic = await db.query.topics.findFirst({
      where: eq(topics.id, topicId),
      with: { subtopics: true },
    });
    if (topic && topic.subtopics.length > 0 && isTopicComplete(topic, topic.subtopics)) {
      await db.update(topics).set({ completedAt: ts }).where(eq(topics.id, topicId));
    }
  }
}

/** Drop volatile today rows from stats; realign completed_at with committed events only. */
export async function repairVolatileCompletionState(objectiveId: string) {
  const today = todayString();
  const db = getDb();

  await db
    .delete(completionEvents)
    .where(
      and(eq(completionEvents.objectiveId, objectiveId), eq(completionEvents.date, today)),
    );

  const subs = await db.query.subjects.findMany({
    where: eq(subjects.objectiveId, objectiveId),
    with: { topics: { with: { subtopics: true } } },
  });
  const topicIds = subs.flatMap((s) => s.topics.map((t) => t.id));
  const subtopicIds = subs.flatMap((s) =>
    s.topics.flatMap((t) => t.subtopics.map((st) => st.id)),
  );

  if (subtopicIds.length > 0) {
    await db
      .update(subtopics)
      .set({ completedAt: null })
      .where(inArray(subtopics.id, subtopicIds));
  }
  if (topicIds.length > 0) {
    await db.update(topics).set({ completedAt: null }).where(inArray(topics.id, topicIds));
  }

  const pastEvents = await db.query.completionEvents.findMany({
    where: eq(completionEvents.objectiveId, objectiveId),
  });
  const ts = nowIso();
  for (const ev of pastEvents) {
    if (ev.date >= today) continue;
    if (ev.subtopicId) {
      await db
        .update(subtopics)
        .set({ completedAt: ts })
        .where(eq(subtopics.id, ev.subtopicId));
    } else {
      await db.update(topics).set({ completedAt: ts }).where(eq(topics.id, ev.topicId));
    }
  }
  for (const topicId of [...new Set(pastEvents.map((e) => e.topicId))]) {
    const topic = await db.query.topics.findFirst({
      where: eq(topics.id, topicId),
      with: { subtopics: true },
    });
    if (topic && topic.subtopics.length > 0 && isTopicComplete(topic, topic.subtopics)) {
      await db.update(topics).set({ completedAt: ts }).where(eq(topics.id, topicId));
    } else if (topic && topic.subtopics.length === 0) {
      const has = pastEvents.some((e) => e.topicId === topicId && !e.subtopicId);
      if (!has) {
        await db.update(topics).set({ completedAt: null }).where(eq(topics.id, topicId));
      }
    }
  }
}

export function isVolatileCompletionDate(date: string): boolean {
  return date === todayString();
}

export async function repairAllVolatileCompletionState() {
  const db = getDb();
  const objs = await db.query.objectives.findMany({
    columns: { id: true },
  });
  for (const o of objs) {
    await repairVolatileCompletionState(o.id);
  }
}
