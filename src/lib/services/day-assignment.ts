import { and, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { getDb, newId } from "@/db";
import {
  dayPlanItems,
  dayPlans,
  objectives,
  studyNotes,
  topics,
} from "@/db/schema";
import { assertWritable } from "@/lib/objective-context";
import { isTopicComplete } from "@/lib/progress";
import { assertPlanDateForObjective } from "@/lib/services/phase-guard";
import { clearTopicProgressOnDate } from "@/lib/services/topic-completion";
import { getOrCreateDayPlan } from "@/lib/services/day-plan";
import { todayString } from "@/lib/study-day";

export type TopicScheduleConflict = {
  topicId: string;
  dates: string[];
};

/** Dates (other than `exceptDate`) where this topic has planned items. */
export async function findTopicScheduledDates(
  objectiveId: string,
  topicId: string,
  exceptDate?: string,
): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ date: dayPlans.date })
    .from(dayPlanItems)
    .innerJoin(dayPlans, eq(dayPlanItems.dayPlanId, dayPlans.id))
    .where(
      and(
        eq(dayPlans.objectiveId, objectiveId),
        eq(dayPlanItems.topicId, topicId),
        eq(dayPlanItems.status, "planned"),
        exceptDate ? ne(dayPlans.date, exceptDate) : sql`1=1`,
      ),
    );
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  return dates;
}

export async function getPhaseScheduleMap(objectiveId: string) {
  const db = getDb();
  const rows = await db
    .select({ topicId: dayPlanItems.topicId, date: dayPlans.date })
    .from(dayPlanItems)
    .innerJoin(dayPlans, eq(dayPlanItems.dayPlanId, dayPlans.id))
    .where(
      and(eq(dayPlans.objectiveId, objectiveId), eq(dayPlanItems.status, "planned")),
    );

  const map: Record<string, string[]> = {};
  for (const r of rows) {
    if (!map[r.topicId]) map[r.topicId] = [];
    if (!map[r.topicId].includes(r.date)) map[r.topicId].push(r.date);
  }
  for (const id of Object.keys(map)) {
    map[id].sort();
  }
  return map;
}

async function addTopicPlanItemsToDay(
  objectiveId: string,
  date: string,
  topicId: string,
  options?: { includeCompleted?: boolean },
) {
  const db = getDb();
  const topic = await db.query.topics.findFirst({
    where: eq(topics.id, topicId),
    with: { subtopics: true },
  });
  if (!topic) throw new Error("Topic not found");
  if (isTopicComplete(topic, topic.subtopics) && !options?.includeCompleted) return;

  const plan = await getOrCreateDayPlan(objectiveId, date);
  const existing = await db.query.dayPlanItems.findMany({
    where: eq(dayPlanItems.dayPlanId, plan.id),
  });
  const existingKeys = new Set(
    existing.map((e) => `${e.topicId}:${e.subtopicId ?? ""}`),
  );

  const maxSort = existing.reduce((m, i) => Math.max(m, i.sortOrder), -1);
  let sortOrder = maxSort + 1;

  const topicLevelKey = `${topicId}:`;
  if (!existingKeys.has(topicLevelKey)) {
    try {
      await db.insert(dayPlanItems).values({
        id: newId(),
        dayPlanId: plan.id,
        topicId,
        subtopicId: null,
        sortOrder,
        status: "planned",
      });
    } catch {
      /* unique */
    }
  }

  const legacySubRows = existing.filter(
    (e) => e.topicId === topicId && e.subtopicId !== null,
  );
  if (legacySubRows.length > 0) {
    await db.delete(dayPlanItems).where(
      inArray(dayPlanItems.id, legacySubRows.map((r) => r.id)),
    );
  }
}

/** Remove planned days for phase topics that fall outside the phase window. */
export async function unschedulePlannedTopicsOutsidePhaseRange(
  objectiveId: string,
  phaseStart: string,
  phaseEnd: string,
  topicIds: string[],
) {
  if (topicIds.length === 0) return;

  const today = todayString();
  const db = getDb();
  const rows = await db
    .select({ topicId: dayPlanItems.topicId, date: dayPlans.date })
    .from(dayPlanItems)
    .innerJoin(dayPlans, eq(dayPlanItems.dayPlanId, dayPlans.id))
    .where(
      and(
        eq(dayPlans.objectiveId, objectiveId),
        eq(dayPlanItems.status, "planned"),
        inArray(dayPlanItems.topicId, topicIds),
        or(lt(dayPlans.date, phaseStart), gt(dayPlans.date, phaseEnd)),
      ),
    );

  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.topicId}:${row.date}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (row.date >= today) {
      await clearTopicProgressOnDate(objectiveId, row.date, row.topicId);
      await db
        .delete(studyNotes)
        .where(
          and(
            eq(studyNotes.objectiveId, objectiveId),
            eq(studyNotes.date, row.date),
            eq(studyNotes.topicId, row.topicId),
          ),
        );
    }
    await removeTopicFromDayPlan(objectiveId, row.date, row.topicId);
  }
}

/** Drop topic from today and all future day plans (notes + volatile progress on those days). */
export async function unscheduleTopicFromAllUpcomingDays(
  objectiveId: string,
  topicId: string,
) {
  const today = todayString();
  const dates = await findTopicScheduledDates(objectiveId, topicId);
  const db = getDb();
  for (const date of dates) {
    if (date < today) continue;
    await clearTopicProgressOnDate(objectiveId, date, topicId);
    await db
      .delete(studyNotes)
      .where(
        and(
          eq(studyNotes.objectiveId, objectiveId),
          eq(studyNotes.date, date),
          eq(studyNotes.topicId, topicId),
        ),
      );
    await removeTopicFromDayPlan(objectiveId, date, topicId);
  }
}

export async function removeTopicFromDayPlan(
  objectiveId: string,
  date: string,
  topicId: string,
) {
  const db = getDb();
  const plan = await db.query.dayPlans.findFirst({
    where: and(eq(dayPlans.objectiveId, objectiveId), eq(dayPlans.date, date)),
    with: { items: true },
  });
  if (!plan) return;
  const ids = plan.items
    .filter((i) => i.topicId === topicId && i.status === "planned")
    .map((i) => i.id);
  if (ids.length === 0) return;
  await db.delete(dayPlanItems).where(inArray(dayPlanItems.id, ids));
}

export async function clearTopicFromOtherDays(
  objectiveId: string,
  topicId: string,
  targetDate: string,
) {
  const db = getDb();
  const rows = await db
    .select({ itemId: dayPlanItems.id })
    .from(dayPlanItems)
    .innerJoin(dayPlans, eq(dayPlanItems.dayPlanId, dayPlans.id))
    .where(
      and(
        eq(dayPlans.objectiveId, objectiveId),
        eq(dayPlanItems.topicId, topicId),
        eq(dayPlanItems.status, "planned"),
        ne(dayPlans.date, targetDate),
      ),
    );
  if (rows.length === 0) return;
  await db.delete(dayPlanItems).where(
    inArray(dayPlanItems.id, rows.map((r) => r.itemId)),
  );
}

/** Assign topic to a day; optionally move off other scheduled days. */
export async function assignTopicToDay(
  objectiveId: string,
  date: string,
  topicId: string,
  options?: { shiftFromOtherDays?: boolean },
) {
  const otherDates = await findTopicScheduledDates(objectiveId, topicId, date);
  if (otherDates.length > 0 && !options?.shiftFromOtherDays) {
    return { ok: false as const, conflictDates: otherDates };
  }
  if (options?.shiftFromOtherDays) {
    const today = todayString();
    for (const d of otherDates) {
      if (d === today) {
        await clearTopicProgressOnDate(objectiveId, today, topicId);
      }
    }
    await clearTopicFromOtherDays(objectiveId, topicId, date);
  }
  await addTopicPlanItemsToDay(objectiveId, date, topicId);
  return { ok: true as const };
}

/** Reschedule a planned topic between today or future days. Clears volatile progress when leaving today. */
export async function moveTopicDayPlan(
  objectiveId: string,
  fromDate: string,
  toDate: string,
  topicId: string,
) {
  if (fromDate === toDate) return;

  const today = todayString();
  if (fromDate < today) {
    throw new Error("Cannot reschedule plans from past days.");
  }
  if (toDate < today) {
    throw new Error("Cannot move plans into the past.");
  }

  const db = getDb();
  const objective = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  if (!objective) throw new Error("Objective not found");
  assertWritable(objective);
  await assertPlanDateForObjective(objectiveId, fromDate);
  await assertPlanDateForObjective(objectiveId, toDate);

  if (fromDate === today) {
    await clearTopicProgressOnDate(objectiveId, today, topicId);
  }
  await db
    .delete(studyNotes)
    .where(
      and(
        eq(studyNotes.objectiveId, objectiveId),
        eq(studyNotes.date, fromDate),
        eq(studyNotes.topicId, topicId),
      ),
    );
  await removeTopicFromDayPlan(objectiveId, fromDate, topicId);
  await addTopicPlanItemsToDay(objectiveId, toDate, topicId);
}
