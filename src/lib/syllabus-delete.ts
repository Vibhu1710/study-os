import {
  isTopicComplete,
  topicCompletedWeight,
  type SubtopicRow,
  type TopicRow,
} from "@/lib/progress";

export function topicDeleteNeedsConfirm(
  topic: TopicRow,
  subtopics: SubtopicRow[],
): boolean {
  if (subtopics.some((s) => s.completedAt)) return true;
  if (topic.completedAt) return true;
  if (topicCompletedWeight(topic, subtopics) > 0) return true;
  if (isTopicComplete(topic, subtopics)) return true;
  return false;
}

/** Summary for dangerous-delete UI (syllabus topic removal). */
export function topicDeleteImpact(
  topic: TopicRow,
  subtopics: SubtopicRow[] | undefined,
  options?: { inPhase?: boolean },
) {
  const subs = subtopics ?? [];
  const hasCommittedProgress =
    Boolean(topic.completedAt) ||
    subs.some((s) => s.completedAt) ||
    topicCompletedWeight(topic, subs) > 0 ||
    isTopicComplete(topic, subs);
  return {
    hasCommittedProgress,
    subtopicCount: subs.length,
    inPhase: options?.inPhase ?? false,
  };
}

export type TopicDeleteImpact = ReturnType<typeof topicDeleteImpact>;

export function subtopicDeleteImpact(
  sub: SubtopicRow & { title?: string },
  topic: TopicRow,
  subtopics: SubtopicRow[],
) {
  const hasCommittedProgress =
    Boolean(sub.completedAt) ||
    Boolean(topic.completedAt) ||
    topicCompletedWeight(topic, subtopics) > 0;
  return {
    hasCommittedProgress,
    subtopicTitle: sub.title ?? "this subtopic",
    topicHasOtherSubtopics: subtopics.length > 1,
  };
}

export type SubtopicDeleteImpact = ReturnType<typeof subtopicDeleteImpact>;

export function subtopicDeleteNeedsConfirm(
  topic: TopicRow,
  subtopics: (SubtopicRow & { id: string })[],
  subId: string,
): boolean {
  const sub = subtopics.find((s) => s.id === subId);
  if (sub?.completedAt) return true;
  if (topicCompletedWeight(topic, subtopics) > 0) return true;
  return false;
}
