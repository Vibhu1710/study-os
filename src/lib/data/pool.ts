import { getPhaseWithTopics } from "@/lib/actions/phases";
import { isTopicComplete, topicCompletedWeight, topicTotalWeight } from "@/lib/progress";

export async function buildPhasePool(phaseId: string | null) {
  if (!phaseId) return [];
  const phase = await getPhaseWithTopics(phaseId);
  if (!phase) return [];

  const items: {
    key: string;
    topicId: string;
    subtopicId: string | null;
    label: string;
    weight: number;
    subjectColor: string;
    subjectName: string;
  }[] = [];

  for (const pt of phase.phaseTopics) {
    const t = pt.topic;
    if (isTopicComplete(t, t.subtopics)) continue;

    if (t.subtopics.length === 0) {
      items.push({
        key: `t-${t.id}`,
        topicId: t.id,
        subtopicId: null,
        label: t.title,
        weight: t.weight,
        subjectColor: t.subject.color,
        subjectName: t.subject.name,
      });
      continue;
    }

    for (const s of t.subtopics) {
      if (s.completedAt) continue;
      items.push({
        key: `s-${s.id}`,
        topicId: t.id,
        subtopicId: s.id,
        label: `${t.title} → ${s.title}`,
        weight: s.weight,
        subjectColor: t.subject.color,
        subjectName: t.subject.name,
      });
    }
  }

  return items;
}

export function phaseTopicProgressSummary(
  phase: Awaited<ReturnType<typeof getPhaseWithTopics>>,
) {
  if (!phase) return { topicCount: 0, totalWeight: 0, doneWeight: 0, percent: 0 };
  let total = 0;
  let done = 0;
  for (const pt of phase.phaseTopics) {
    total += topicTotalWeight(pt.topic, pt.topic.subtopics);
    done += topicCompletedWeight(pt.topic, pt.topic.subtopics);
  }
  return {
    topicCount: phase.phaseTopics.length,
    totalWeight: total,
    doneWeight: done,
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
  };
}
