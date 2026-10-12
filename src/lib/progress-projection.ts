import type { CompletionDates } from "@/lib/completion-dates";
import { isTopicComplete, topicTotalWeight } from "@/lib/progress";

export type VolatileTodayKeys = {
  subtopicIds: Set<string>;
  topicIds: Set<string>;
};

export function projectedTopicCompletedWeight(
  topic: { id: string; weight: number; completedAt: string | null },
  subs: { id: string; weight: number; completedAt: string | null }[],
  volatile: VolatileTodayKeys,
): number {
  if (subs.length === 0) {
    return topic.completedAt || volatile.topicIds.has(topic.id) ? topic.weight : 0;
  }
  return subs
    .filter((s) => s.completedAt || volatile.subtopicIds.has(s.id))
    .reduce((sum, s) => sum + s.weight, 0);
}

export function volatileKeysFromCompletionDates(
  completionDates: CompletionDates,
  today: string,
): VolatileTodayKeys {
  const subtopicIds = new Set<string>();
  const topicIds = new Set<string>();
  for (const [id, date] of Object.entries(completionDates.bySubtopicId)) {
    if (date === today) subtopicIds.add(id);
  }
  for (const [id, date] of Object.entries(completionDates.byTopicId)) {
    if (date === today) topicIds.add(id);
  }
  return { subtopicIds, topicIds };
}

export function projectedIsTopicComplete(
  topic: { id: string; weight: number; completedAt: string | null },
  subs: { id: string; weight: number; completedAt: string | null }[],
  volatile: VolatileTodayKeys,
): boolean {
  if (isTopicComplete(topic, subs)) return true;
  if (subs.length === 0) {
    return volatile.topicIds.has(topic.id);
  }
  return subs.every(
    (s) => Boolean(s.completedAt) || volatile.subtopicIds.has(s.id),
  );
}

/** Any committed or today-volatile completion (partial or full). */
export function topicHasStartedProgress(
  topic: { id: string; weight: number; completedAt: string | null },
  subs: { id: string; weight: number; completedAt: string | null }[],
  volatile: VolatileTodayKeys,
): boolean {
  return projectedTopicCompletedWeight(topic, subs, volatile) > 0;
}

/**
 * Whether −φ (remove from phase) must be blocked.
 * - Topics with subtopics: only today's volatile subtopic checks block (past subs may be dephased).
 * - Leaf topics: any committed or today-volatile completion blocks.
 */
export function topicBlocksDephase(
  topic: { id: string; weight: number; completedAt: string | null },
  subs: { id: string; weight: number; completedAt: string | null }[],
  volatile: VolatileTodayKeys,
): boolean {
  if (subs.length > 0) {
    return subs.some((s) => volatile.subtopicIds.has(s.id));
  }
  return topicHasStartedProgress(topic, subs, volatile);
}

export function dephaseBlockReason(
  topic: { id: string; weight: number; completedAt: string | null },
  subs: { id: string; weight: number; completedAt: string | null }[],
  volatile: VolatileTodayKeys,
): string | null {
  if (!topicBlocksDephase(topic, subs, volatile)) return null;
  if (subs.length > 0) {
    return "Cannot remove — subtopics checked today (not committed yet)";
  }
  return "Cannot remove — work has started on this topic";
}

export function projectedTopicProgressPercent(
  topic: { id: string; weight: number; completedAt: string | null },
  subs: { id: string; weight: number; completedAt: string | null }[],
  volatile: VolatileTodayKeys,
): number {
  const total = topicTotalWeight(topic, subs);
  if (total <= 0) return 0;
  const done = projectedTopicCompletedWeight(topic, subs, volatile);
  return Math.round((done / total) * 100);
}
