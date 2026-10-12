import {
  projectedIsTopicComplete,
  type VolatileTodayKeys,
} from "@/lib/progress-projection";

export type SyllabusTopic = {
  id: string;
  subjectId: string;
  title: string;
  weight: number;
  sortOrder: number;
  completedAt: string | null;
  notes?: string | null;
  subtopics: {
    id: string;
    title: string;
    weight: number;
    completedAt: string | null;
    notes?: string | null;
  }[];
};

export type SyllabusSubjectBucket = {
  id: string;
  name: string;
  color: string;
  topics: SyllabusTopic[];
  backlogItems?: { id: string; title: string; notes: string | null }[];
};

function mergeSubjects(
  active: SyllabusSubjectBucket[],
  completed: SyllabusSubjectBucket[],
): SyllabusSubjectBucket[] {
  const order: string[] = [];
  const meta = new Map<string, SyllabusSubjectBucket>();
  const topicsBySubject = new Map<string, Map<string, SyllabusTopic>>();

  for (const s of [...active, ...completed]) {
    if (!meta.has(s.id)) {
      order.push(s.id);
      meta.set(s.id, { ...s, topics: [] });
      topicsBySubject.set(s.id, new Map());
    }
    const topicMap = topicsBySubject.get(s.id)!;
    for (const t of s.topics) {
      topicMap.set(t.id, t);
    }
  }

  return order.map((id) => {
    const base = meta.get(id)!;
    const topics = [...topicsBySubject.get(id)!.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    return { ...base, topics };
  });
}

export function rebucketSyllabusSubjects(
  active: SyllabusSubjectBucket[],
  completed: SyllabusSubjectBucket[],
  volatile: VolatileTodayKeys,
): {
  active: SyllabusSubjectBucket[];
  completed: SyllabusSubjectBucket[];
  activeTopicCount: number;
  completedTopicCount: number;
} {
  const merged = mergeSubjects(active, completed);
  const nextActive: SyllabusSubjectBucket[] = [];
  const nextCompleted: SyllabusSubjectBucket[] = [];
  let activeTopicCount = 0;
  let completedTopicCount = 0;

  for (const subject of merged) {
    const activeTopics = subject.topics.filter(
      (t) => !projectedIsTopicComplete(t, t.subtopics, volatile),
    );
    const doneTopics = subject.topics.filter((t) =>
      projectedIsTopicComplete(t, t.subtopics, volatile),
    );
    activeTopicCount += activeTopics.length;
    completedTopicCount += doneTopics.length;
    nextActive.push({ ...subject, topics: activeTopics });
    if (doneTopics.length > 0) {
      nextCompleted.push({ ...subject, topics: doneTopics });
    }
  }

  return {
    active: nextActive,
    completed: nextCompleted,
    activeTopicCount,
    completedTopicCount,
  };
}
