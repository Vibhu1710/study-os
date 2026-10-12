import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, newId } from "@/db";
import {
  completionEvents,
  dayPlanItems,
  dayPlans,
  objectives,
  dayNotes,
  studyNotes,
  subjects,
  subtopics,
  topics,
} from "@/db/schema";
import { addDaysString, isDateInRange } from "@/lib/dates";
import { assertWritable } from "@/lib/objective-context";
import { assertPlanDateForObjective } from "@/lib/services/phase-guard";
import { todayString } from "@/lib/study-day";
import { isTopicComplete } from "@/lib/progress";
import {
  type DayCompletionTouch,
  remainingPlannedDayPlanItemWeight,
} from "@/lib/schedule-weight";
import { commitCompletionsForDate } from "@/lib/services/completion-commit";
import { roundWeightTenth } from "@/lib/weight";

export async function getOrCreateDayPlan(objectiveId: string, date: string) {
  const db = getDb();
  const existing = await db.query.dayPlans.findFirst({
    where: and(eq(dayPlans.objectiveId, objectiveId), eq(dayPlans.date, date)),
  });
  if (existing) return existing;
  const id = newId();
  await db.insert(dayPlans).values({ id, objectiveId, date });
  return { id, objectiveId, date };
}

export async function rollForwardToDate(objectiveId: string, targetDate: string) {
  const db = getDb();
  const objective = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  if (!objective) return;

  const start = objective.startDate;
  if (targetDate <= start) return;

  let cursor = start;
  while (cursor < targetDate) {
    const next = addDaysString(cursor, 1);
    await rollDay(objectiveId, cursor, next);
    cursor = next;
  }
}

async function rollDay(objectiveId: string, fromDate: string, toDate: string) {
  const db = getDb();
  await commitCompletionsForDate(objectiveId, fromDate);
  const fromPlan = await db.query.dayPlans.findFirst({
    where: and(eq(dayPlans.objectiveId, objectiveId), eq(dayPlans.date, fromDate)),
    with: { items: true },
  });
  if (!fromPlan) return;

  const toPlan = await getOrCreateDayPlan(objectiveId, toDate);

  for (const item of fromPlan.items) {
    if (item.status !== "planned") continue;
    const complete = await isPlanItemComplete(
      objectiveId,
      fromDate,
      item.topicId,
      item.subtopicId,
    );
    if (complete) {
      await db
        .update(dayPlanItems)
        .set({ status: "done" })
        .where(eq(dayPlanItems.id, item.id));
      continue;
    }

    const duplicate = await db.query.dayPlanItems.findFirst({
      where: and(
        eq(dayPlanItems.dayPlanId, toPlan.id),
        eq(dayPlanItems.topicId, item.topicId),
        item.subtopicId
          ? eq(dayPlanItems.subtopicId, item.subtopicId)
          : sql`${dayPlanItems.subtopicId} IS NULL`,
      ),
    });
    if (!duplicate) {
      await db.insert(dayPlanItems).values({
        id: newId(),
        dayPlanId: toPlan.id,
        topicId: item.topicId,
        subtopicId: item.subtopicId,
        sortOrder: item.sortOrder,
        status: "planned",
      });
    }
    await db.delete(dayPlanItems).where(eq(dayPlanItems.id, item.id));
  }
}

async function isPlanItemComplete(
  objectiveId: string,
  fromDate: string,
  topicId: string,
  subtopicId: string | null,
) {
  const db = getDb();
  if (subtopicId) {
    const ev = await db.query.completionEvents.findFirst({
      where: and(
        eq(completionEvents.objectiveId, objectiveId),
        eq(completionEvents.subtopicId, subtopicId),
        eq(completionEvents.date, fromDate),
      ),
    });
    if (ev) return true;
    const today = todayString();
    if (fromDate < today) return false;
    const sub = await db.query.subtopics.findFirst({
      where: eq(subtopics.id, subtopicId),
    });
    return Boolean(sub?.completedAt);
  }
  const topic = await db.query.topics.findFirst({
    where: eq(topics.id, topicId),
    with: {
      subtopics: {
        orderBy: (st, { asc }) => [asc(st.sortOrder)],
      },
    },
  });
  if (!topic) return false;
  if (topic.subtopics.length === 0) {
    const ev = await db.query.completionEvents.findFirst({
      where: and(
        eq(completionEvents.objectiveId, objectiveId),
        eq(completionEvents.topicId, topicId),
        isNull(completionEvents.subtopicId),
        eq(completionEvents.date, fromDate),
      ),
    });
    if (ev) return true;
    const today = todayString();
    if (fromDate < today) return false;
    return Boolean(topic.completedAt);
  }
  const events = await db.query.completionEvents.findMany({
    where: and(
      eq(completionEvents.objectiveId, objectiveId),
      eq(completionEvents.topicId, topicId),
      eq(completionEvents.date, fromDate),
    ),
  });
  const loggedSubIds = new Set(
    events.filter((e) => e.subtopicId).map((e) => e.subtopicId!),
  );
  if (loggedSubIds.size === topic.subtopics.length) return true;
  const today = todayString();
  if (fromDate < today) return false;
  return isTopicComplete(topic, topic.subtopics);
}

export async function addDayPlanItem(
  objectiveId: string,
  date: string,
  topicId: string,
  subtopicId?: string | null,
) {
  const db = getDb();
  const objective = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  if (!objective) throw new Error("Objective not found");
  assertWritable(objective);
  if (!isDateInRange(date, objective.startDate, objective.endDate)) {
    throw new Error("Date outside objective range");
  }
  await assertPlanDateForObjective(objectiveId, date);

  const plan = await getOrCreateDayPlan(objectiveId, date);
  const maxSort = await db
    .select({ m: sql<number>`coalesce(max(${dayPlanItems.sortOrder}), -1)` })
    .from(dayPlanItems)
    .where(eq(dayPlanItems.dayPlanId, plan.id));

  const sortOrder = (maxSort[0]?.m ?? -1) + 1;

  try {
    await db.insert(dayPlanItems).values({
      id: newId(),
      dayPlanId: plan.id,
      topicId,
      subtopicId: subtopicId ?? null,
      sortOrder,
      status: "planned",
    });
  } catch {
    // unique constraint — already on plan
  }
}

export async function removeDayPlanItem(itemId: string) {
  const db = getDb();
  const item = await db.query.dayPlanItems.findFirst({
    where: eq(dayPlanItems.id, itemId),
    with: { dayPlan: { with: { objective: true } } },
  });
  if (!item) return;
  assertWritable(item.dayPlan.objective);
  await assertPlanDateForObjective(item.dayPlan.objectiveId, item.dayPlan.date);
  await db.delete(dayPlanItems).where(eq(dayPlanItems.id, itemId));
}

export async function getDayPlanBundle(objectiveId: string, date: string) {
  const db = getDb();
  if (date <= todayString()) {
    await rollForwardToDate(objectiveId, date);
  }

  const plan = await db.query.dayPlans.findFirst({
    where: and(eq(dayPlans.objectiveId, objectiveId), eq(dayPlans.date, date)),
    with: {
      items: {
        with: {
          topic: {
            with: {
              subject: true,
              subtopics: {
                orderBy: (st, { asc }) => [asc(st.sortOrder)],
              },
            },
          },
        },
      },
    },
  });

  const today = todayString();
  const isPastDay = date < today;

  let items = (plan?.items ?? [])
    .filter((i) => (isPastDay ? i.status === "planned" || i.status === "done" : i.status === "planned"))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => {
      const sub = item.subtopicId
        ? item.topic.subtopics.find((s) => s.id === item.subtopicId)
        : null;
      return { ...item, subtopic: sub };
    });

  if (isPastDay) {
    const topicIdsOnPlan = new Set(items.map((i) => i.topicId));
    const dayEvents = await db.query.completionEvents.findMany({
      where: and(
        eq(completionEvents.objectiveId, objectiveId),
        eq(completionEvents.date, date),
      ),
    });
    const extraTopicIds = [...new Set(dayEvents.map((e) => e.topicId))].filter(
      (id) => !topicIdsOnPlan.has(id),
    );
    if (extraTopicIds.length > 0) {
      const extraTopics = await db.query.topics.findMany({
        where: inArray(topics.id, extraTopicIds),
        with: {
          subject: true,
          subtopics: {
            orderBy: (st, { asc }) => [asc(st.sortOrder)],
          },
        },
      });
      for (const topic of extraTopics) {
        if (topic.subtopics.length === 0) {
          const loggedOnDay = dayEvents.some(
            (e) => e.topicId === topic.id && !e.subtopicId,
          );
          if (!loggedOnDay) continue;
        }
        items.push({
          id: `history-${topic.id}`,
          dayPlanId: plan?.id ?? "",
          topicId: topic.id,
          subtopicId: null,
          sortOrder: items.length,
          status: "planned",
          topic,
          subtopic: null,
        });
      }
    }

    items = items.filter((item) => {
      const subs = item.topic.subtopics;
      if (subs.length > 0) return true;
      const logged = dayEvents.some(
        (e) => e.topicId === item.topicId && !e.subtopicId,
      );
      return logged;
    });
  }

  return { plan, items };
}

export async function getCalendarDayStats(objectiveId: string) {
  const db = getDb();
  const today = todayString();
  const events = await db.query.completionEvents.findMany({
    where: eq(completionEvents.objectiveId, objectiveId),
    with: { subject: true, topic: true, subtopic: true },
  });

  const subjectById = new Map(
    (
      await db.query.subjects.findMany({
        where: eq(subjects.objectiveId, objectiveId),
      })
    ).map((s) => [s.id, { name: s.name, color: s.color }]),
  );

  const byDate: Record<
    string,
    {
      totalWeight: number;
      plannedTotalWeight: number;
      completedBySubject: Record<string, number>;
      plannedBySubject: Record<string, number>;
      completedSubjectBreakdown: {
        subjectId: string;
        name: string;
        color: string;
        weight: number;
      }[];
      plannedSubjectBreakdown: {
        subjectId: string;
        name: string;
        color: string;
        weight: number;
      }[];
      completionCount: number;
      previews: string[];
      plannedCount?: number;
    }
  > = {};

  function ensureDate(date: string) {
    if (!byDate[date]) {
      byDate[date] = {
        totalWeight: 0,
        plannedTotalWeight: 0,
        completedBySubject: {},
        plannedBySubject: {},
        completedSubjectBreakdown: [],
        plannedSubjectBreakdown: [],
        completionCount: 0,
        previews: [],
      };
    }
    return byDate[date];
  }

  function breakdownFromMap(map: Record<string, number>) {
    return Object.entries(map)
      .map(([subjectId, weight]) => {
        const meta = subjectById.get(subjectId);
        return {
          subjectId,
          name: meta?.name ?? "Subject",
          color: meta?.color ?? "var(--accent)",
          weight,
        };
      })
      .filter((x) => x.weight > 0)
      .sort((a, b) => b.weight - a.weight);
  }

  function roundRowWeights(
    row: (typeof byDate)[string],
  ) {
    row.totalWeight = roundWeightTenth(row.totalWeight);
    row.plannedTotalWeight = roundWeightTenth(row.plannedTotalWeight);
    for (const [id, w] of Object.entries(row.completedBySubject)) {
      row.completedBySubject[id] = roundWeightTenth(w);
    }
    for (const [id, w] of Object.entries(row.plannedBySubject)) {
      row.plannedBySubject[id] = roundWeightTenth(w);
    }
  }

  function finalizeBreakdowns() {
    for (const row of Object.values(byDate)) {
      roundRowWeights(row);
      row.completedSubjectBreakdown = breakdownFromMap(row.completedBySubject);
      row.plannedSubjectBreakdown = breakdownFromMap(row.plannedBySubject);
    }
  }

  const completionTouchesByDate = new Map<string, DayCompletionTouch[]>();

  for (const e of events) {
    const row = ensureDate(e.date);
    row.totalWeight += e.weightSnapshot;
    row.completedBySubject[e.subjectId] =
      (row.completedBySubject[e.subjectId] ?? 0) + e.weightSnapshot;
    row.completionCount += 1;
    const label = e.subtopic
      ? `${e.topic.title} → ${e.subtopic.title}`
      : e.topic.title;
    if (row.previews.length < 6) {
      row.previews.push(label);
    }
    const touches = completionTouchesByDate.get(e.date) ?? [];
    touches.push({
      topicId: e.topicId,
      subtopicId: e.subtopicId,
      weight: e.weightSnapshot,
    });
    completionTouchesByDate.set(e.date, touches);
  }

  const plans = await db.query.dayPlans.findMany({
    where: eq(dayPlans.objectiveId, objectiveId),
    with: {
      items: {
        with: {
          topic: {
            with: {
              subtopics: {
                orderBy: (st, { asc }) => [asc(st.sortOrder)],
              },
            },
          },
          subtopic: true,
        },
      },
    },
  });
  for (const plan of plans) {
    const plannedItems = plan.items.filter((i) => i.status === "planned");
    if (plannedItems.length > 0) {
      const row = ensureDate(plan.date);
      row.plannedCount = plannedItems.length;
      const loggedOnDay = completionTouchesByDate.get(plan.date) ?? [];
      for (const item of plannedItems) {
        const w = remainingPlannedDayPlanItemWeight(
          item,
          plan.date,
          today,
          loggedOnDay,
        );
        if (w <= 0) continue;
        row.plannedTotalWeight += w;
        row.plannedBySubject[item.topic.subjectId] =
          (row.plannedBySubject[item.topic.subjectId] ?? 0) + w;
      }
    }
  }

  finalizeBreakdowns();
  return byDate;
}

export async function getDayDetail(objectiveId: string, date: string) {
  const db = getDb();
  const events = await db.query.completionEvents.findMany({
    where: and(
      eq(completionEvents.objectiveId, objectiveId),
      eq(completionEvents.date, date),
    ),
    with: {
      topic: true,
      subtopic: true,
      subject: true,
    },
  });

  const notes = await db.query.studyNotes.findMany({
    where: and(
      eq(studyNotes.objectiveId, objectiveId),
      eq(studyNotes.date, date),
    ),
    with: { topic: true, subtopic: true },
  });

  const dayNoteRow = await db.query.dayNotes.findFirst({
    where: and(eq(dayNotes.objectiveId, objectiveId), eq(dayNotes.date, date)),
  });

  const planBundle = await getDayPlanBundle(objectiveId, date);

  return {
    events,
    notes,
    dayNote: dayNoteRow?.body?.trim() ? dayNoteRow.body : null,
    planItems: planBundle.items,
  };
}
