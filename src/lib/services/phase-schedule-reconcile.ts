import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { studyNotes } from "@/db/schema";
import {
  unschedulePlannedTopicsOutsidePhaseRange,
  unscheduleTopicFromAllUpcomingDays,
} from "@/lib/services/day-assignment";
import { clearTopicProgressOnDate } from "@/lib/services/topic-completion";
import { todayString } from "@/lib/study-day";

/**
 * Align day-plan allotments with the active phase window and membership.
 *
 * **Invariant (planning + future phase analytics):** phase topics may only
 * have `planned` day-plan rows on dates within [phaseStart, phaseEnd]. Orphan
 * future dates would skew estimated remaining weight, pace, and coverage.
 *
 * Call whenever phase bounds or topic membership change — e.g. edit phase today,
 * and later any dashboard-driven phase adjustments that reuse the same rules.
 */
export async function reconcilePhaseSchedulesWithBounds(
  objectiveId: string,
  phaseStart: string,
  phaseEnd: string,
  phaseTopicIds: string[],
  options?: { removedFromPhaseTopicIds?: string[] },
) {
  const removed = options?.removedFromPhaseTopicIds ?? [];
  for (const topicId of removed) {
    await unscheduleTopicFromAllUpcomingDays(objectiveId, topicId);
  }
  await unschedulePlannedTopicsOutsidePhaseRange(
    objectiveId,
    phaseStart,
    phaseEnd,
    phaseTopicIds,
  );
  await flushTodayPhaseTopicProgressIfOutsideWindow(
    objectiveId,
    phaseStart,
    phaseEnd,
    phaseTopicIds,
  );
}

/** Clear today's volatile completion when today is no longer inside the phase window. */
export async function flushTodayPhaseTopicProgressIfOutsideWindow(
  objectiveId: string,
  phaseStart: string,
  phaseEnd: string,
  topicIds: string[],
) {
  const today = todayString();
  if (topicIds.length === 0) return;
  if (today >= phaseStart && today <= phaseEnd) return;

  const db = getDb();
  for (const topicId of topicIds) {
    await clearTopicProgressOnDate(objectiveId, today, topicId);
    await db
      .delete(studyNotes)
      .where(
        and(
          eq(studyNotes.objectiveId, objectiveId),
          eq(studyNotes.date, today),
          eq(studyNotes.topicId, topicId),
        ),
      );
  }
}
