import { roundWeightTenth } from "@/lib/weight";

export type TopicRow = {
  weight: number;
  completedAt: string | null;
};

export type SubtopicRow = {
  weight: number;
  completedAt: string | null;
};

export function topicCompletedWeight(
  topic: TopicRow,
  subs: SubtopicRow[],
): number {
  if (subs.length === 0) {
    return topic.completedAt ? roundWeightTenth(topic.weight) : 0;
  }
  return roundWeightTenth(
    subs
      .filter((s) => s.completedAt)
      .reduce((sum, s) => sum + s.weight, 0),
  );
}

export function topicTotalWeight(topic: TopicRow, subs: SubtopicRow[]): number {
  if (subs.length === 0) return roundWeightTenth(topic.weight);
  return roundWeightTenth(subs.reduce((sum, s) => sum + s.weight, 0));
}

/**
 * Weight still allocatable for planning (excludes subtopics already completed).
 * For day-plan rows, prefer `plannedDayPlanItemWeight` in `@/lib/schedule-weight`.
 */
export function topicRemainingWeight(
  topic: TopicRow,
  subs: SubtopicRow[],
): number {
  if (subs.length === 0) {
    return topic.completedAt ? 0 : topic.weight;
  }
  return roundWeightTenth(
    subs
      .filter((s) => !s.completedAt)
      .reduce((sum, s) => sum + s.weight, 0),
  );
}

export function isTopicComplete(
  topic: TopicRow,
  subs: SubtopicRow[],
): boolean {
  if (subs.length === 0) return Boolean(topic.completedAt);
  return subs.length > 0 && subs.every((s) => s.completedAt);
}

export function topicProgressPercent(
  topic: TopicRow,
  subs: SubtopicRow[],
): number {
  const total = topicTotalWeight(topic, subs);
  if (total <= 0) return 0;
  return Math.round((topicCompletedWeight(topic, subs) / total) * 100);
}
