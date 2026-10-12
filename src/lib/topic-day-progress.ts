import type { CompletionDates } from "@/lib/completion-dates";

type TopicLike = {
  id: string;
  subtopics: { id: string }[];
};

export function topicHasProgressOnDate(
  topic: TopicLike,
  date: string,
  completionDates: CompletionDates,
): boolean {
  if (topic.subtopics.length === 0) {
    return completionDates.byTopicId[topic.id] === date;
  }
  return topic.subtopics.some(
    (s) => completionDates.bySubtopicId[s.id] === date,
  );
}

export function findTopicInSubjects(
  topicId: string,
  subjects: { topics: TopicLike[] }[],
): TopicLike | undefined {
  for (const s of subjects) {
    const t = s.topics.find((x) => x.id === topicId);
    if (t) return t;
  }
  return undefined;
}
