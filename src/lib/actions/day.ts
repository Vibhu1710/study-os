"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, newId, nowIso } from "@/db";
import { dayNotes, studyNotes } from "@/db/schema";
import {
  addDayPlanItem,
  getCalendarDayStats,
  getDayDetail,
  getDayPlanBundle,
  removeDayPlanItem,
} from "@/lib/services/day-plan";
import {
  assignTopicToDay,
  getPhaseScheduleMap,
  moveTopicDayPlan,
  removeTopicFromDayPlan,
} from "@/lib/services/day-assignment";
import { clearTopicProgressOnDate } from "@/lib/services/topic-completion";
import { assertWritable } from "@/lib/objective-context";
import {
  assertCompleteDateForObjective,
  assertPlanDateForObjective,
} from "@/lib/services/phase-guard";
import { todayString } from "@/lib/study-day";
import { isDateInRange } from "@/lib/dates";
import { getObjectivePhaseBounds } from "@/lib/services/phase-guard";
import { objectives } from "@/db/schema";

function revalidate() {
  revalidatePath("/");
  revalidatePath("/syllabus");
  revalidatePath("/dashboard");
}

export async function fetchDayPlan(objectiveId: string, date: string) {
  return getDayPlanBundle(objectiveId, date);
}

export async function fetchCalendarStats(objectiveId: string) {
  return getCalendarDayStats(objectiveId);
}

export async function fetchDayDetail(objectiveId: string, date: string) {
  return getDayDetail(objectiveId, date);
}

export async function addToDay(
  objectiveId: string,
  date: string,
  topicId: string,
  subtopicId?: string | null,
) {
  await addDayPlanItem(objectiveId, date, topicId, subtopicId);
  revalidate();
}

export async function removeFromDay(itemId: string) {
  await removeDayPlanItem(itemId);
  revalidate();
}

export async function fetchPhaseScheduleMap(objectiveId: string) {
  return getPhaseScheduleMap(objectiveId);
}

export async function scheduleTopicOnDay(
  objectiveId: string,
  date: string,
  topicId: string,
  shiftFromOtherDays = false,
) {
  const result = await assignTopicToDay(objectiveId, date, topicId, {
    shiftFromOtherDays,
  });
  revalidate();
  return result;
}

export async function scheduleTopicsOnDay(
  objectiveId: string,
  date: string,
  topicIds: string[],
  shiftFromOtherDays = false,
) {
  const conflicts: { topicId: string; dates: string[] }[] = [];
  for (const topicId of topicIds) {
    const result = await assignTopicToDay(objectiveId, date, topicId, {
      shiftFromOtherDays,
    });
    if (!result.ok) {
      conflicts.push({ topicId, dates: result.conflictDates });
    }
  }
  revalidate();
  return { conflicts };
}

export async function unscheduleTopicFromDay(
  objectiveId: string,
  date: string,
  topicId: string,
) {
  const today = todayString();
  if (date < today) {
    throw new Error("Cannot change plans on past days.");
  }
  const db = getDb();
  const objective = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  if (!objective) throw new Error("Objective not found");
  assertWritable(objective);
  await assertPlanDateForObjective(objectiveId, date);

  if (date >= today) {
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
  }
  await removeTopicFromDayPlan(objectiveId, date, topicId);
  revalidate();
  revalidatePath("/dashboard");
}

export async function moveTopicPlanToDay(
  objectiveId: string,
  fromDate: string,
  toDate: string,
  topicId: string,
) {
  await moveTopicDayPlan(objectiveId, fromDate, toDate, topicId);
  revalidate();
}

export async function upsertDayNote(input: {
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
  const existing = await db.query.dayNotes.findFirst({
    where: and(
      eq(dayNotes.objectiveId, input.objectiveId),
      eq(dayNotes.date, input.date),
    ),
  });

  if (!trimmed) {
    if (existing) {
      await db.delete(dayNotes).where(eq(dayNotes.id, existing.id));
    }
    revalidate();
    return;
  }

  if (existing) {
    await db
      .update(dayNotes)
      .set({ body: trimmed, updatedAt: nowIso() })
      .where(eq(dayNotes.id, existing.id));
  } else {
    await db.insert(dayNotes).values({
      id: newId(),
      objectiveId: input.objectiveId,
      date: input.date,
      body: trimmed,
      updatedAt: nowIso(),
    });
  }
  revalidate();
}

export async function upsertStudyNote(input: {
  objectiveId: string;
  date: string;
  topicId: string;
  subtopicId?: string | null;
  body: string;
}) {
  const db = getDb();
  const objective = await db.query.objectives.findFirst({
    where: eq(objectives.id, input.objectiveId),
  });
  if (!objective) throw new Error("Objective not found");
  assertWritable(objective);
  await assertCompleteDateForObjective(input.objectiveId, input.date);

  const existing = await db.query.studyNotes.findFirst({
    where: and(
      eq(studyNotes.objectiveId, input.objectiveId),
      eq(studyNotes.date, input.date),
      eq(studyNotes.topicId, input.topicId),
      input.subtopicId
        ? eq(studyNotes.subtopicId, input.subtopicId)
        : isNull(studyNotes.subtopicId),
    ),
  });

  if (existing) {
    await db
      .update(studyNotes)
      .set({ body: input.body, updatedAt: nowIso() })
      .where(eq(studyNotes.id, existing.id));
  } else {
    await db.insert(studyNotes).values({
      id: newId(),
      objectiveId: input.objectiveId,
      date: input.date,
      topicId: input.topicId,
      subtopicId: input.subtopicId ?? null,
      body: input.body,
      updatedAt: nowIso(),
    });
  }
  revalidate();
}
