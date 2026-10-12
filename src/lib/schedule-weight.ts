/**
 * Canonical planned / scheduled weight for day-plan items.
 *
 * Use this anywhere “how much weight does this plan row count for?” matters:
 * calendar heat (planned stripe), per-day planned totals, dashboard charts,
 * and future projected-vs-planned graphs. Completed subtopics are excluded so
 * partially finished topics only contribute their **remaining** weight.
 *
 * @see topicRemainingWeight in progress.ts for topic-level remaining weight
 */

import {
  type SubtopicRow,
  type TopicRow,
  topicRemainingWeight,
} from "@/lib/progress";

export type DayPlanItemForWeight = {
  subtopic: (SubtopicRow & { id?: string }) | null;
  topic: TopicRow & { id: string; subtopics?: (SubtopicRow & { id?: string })[] };
};

/** Completion logged on a plan date (events). Used for volatile today before `completedAt` is set. */
export type DayCompletionTouch = {
  topicId: string;
  subtopicId: string | null;
  weight: number;
};

/** Weight this planned item should count toward daily planned totals. */
export function plannedDayPlanItemWeight(item: DayPlanItemForWeight): number {
  if (item.subtopic) {
    return item.subtopic.completedAt ? 0 : item.subtopic.weight;
  }
  const subs = item.topic.subtopics ?? [];
  return topicRemainingWeight(item.topic, subs);
}

/** Sum planned weight for a list of day-plan items (skips zero / already-done rows). */
export function sumPlannedDayPlanItemWeights(
  items: DayPlanItemForWeight[],
): number {
  let total = 0;
  for (const item of items) {
    const w = plannedDayPlanItemWeight(item);
    if (w > 0) total += w;
  }
  return total;
}

/**
 * Remaining planned weight for a calendar day row.
 * On today, subtracts completion events already logged that day (volatile progress
 * before midnight commit) so top-bar “remaining” matches bottom-bar “done”.
 */
export function remainingPlannedDayPlanItemWeight(
  item: DayPlanItemForWeight,
  planDate: string,
  today: string,
  loggedOnPlanDate: DayCompletionTouch[],
): number {
  let remaining = plannedDayPlanItemWeight(item);
  if (remaining <= 0 || planDate !== today || loggedOnPlanDate.length === 0) {
    return remaining;
  }

  const topicId = item.topic.id;
  const hasSubs = (item.topic.subtopics?.length ?? 0) > 0;

  for (const e of loggedOnPlanDate) {
    if (item.subtopic) {
      if (e.subtopicId === item.subtopic.id) remaining -= e.weight;
      continue;
    }
    if (e.topicId !== topicId) continue;
    if (!hasSubs) {
      if (e.subtopicId == null) remaining -= e.weight;
    } else if (e.subtopicId) {
      remaining -= e.weight;
    }
  }

  return Math.max(0, remaining);
}
