"use server";

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { subDays } from "date-fns";
import { toDateString } from "@/lib/dates";
import { getDb } from "@/db";
import {
  completionEvents,
  objectives,
  phaseTopics,
  phases,
  subjects,
} from "@/db/schema";
import { topicTotalWeight } from "@/lib/progress";
import { phaseScopedTopicWeights, scopeMarksFromEvents } from "@/lib/phase-scope-weight";
import { todayString } from "@/lib/study-day";
import {
  projectedIsTopicComplete,
  projectedTopicCompletedWeight,
} from "@/lib/progress-projection";
import { fetchVolatileTodayKeys } from "@/lib/progress-projection-server";

export type SubjectProgress = {
  subjectId: string;
  name: string;
  color: string;
  completedWeight: number;
  totalWeight: number;
  percent: number;
};

export async function getGlobalProgress(
  objectiveId: string,
): Promise<SubjectProgress[]> {
  const db = getDb();
  const volatile = await fetchVolatileTodayKeys(objectiveId);
  const subs = await db.query.subjects.findMany({
    where: eq(subjects.objectiveId, objectiveId),
    with: { topics: { with: { subtopics: true } } },
  });

  return subs.map((s) => {
    let completed = 0;
    let total = 0;
    for (const t of s.topics) {
      completed += projectedTopicCompletedWeight(t, t.subtopics, volatile);
      total += topicTotalWeight(t, t.subtopics);
    }
    return {
      subjectId: s.id,
      name: s.name,
      color: s.color,
      completedWeight: completed,
      totalWeight: total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  });
}

/** Phase scope totals; assumes plans stay in [phase.startDate, phase.endDate] via reconcilePhaseSchedulesWithBounds. */
export async function getPhaseProgress(
  objectiveId: string,
  phaseId: string,
): Promise<SubjectProgress[]> {
  const db = getDb();
  const phase = await db.query.phases.findFirst({
    where: eq(phases.id, phaseId),
    with: {
      phaseTopics: {
        with: {
          topic: { with: { subject: true, subtopics: true } },
        },
      },
    },
  });
  if (!phase) return [];

  const volatile = await fetchVolatileTodayKeys(objectiveId);
  const topicIds = phase.phaseTopics.map((pt) => pt.topicId);
  const scopeEvents =
    topicIds.length === 0
      ? []
      : await db.query.completionEvents.findMany({
          where: and(
            eq(completionEvents.objectiveId, objectiveId),
            inArray(completionEvents.topicId, topicIds),
          ),
        });
  const { prior, inPhase } = scopeMarksFromEvents(
    scopeEvents,
    phase.startDate,
    phase.endDate,
  );
  const bySubject = new Map<string, SubjectProgress>();

  for (const pt of phase.phaseTopics) {
    const t = pt.topic;
    const s = t.subject;
    const scoped = phaseScopedTopicWeights(
      t,
      t.subtopics,
      phase.startDate,
      prior,
      inPhase,
      volatile,
    );
    if (scoped.total <= 0) continue;
    if (!bySubject.has(s.id)) {
      bySubject.set(s.id, {
        subjectId: s.id,
        name: s.name,
        color: s.color,
        completedWeight: 0,
        totalWeight: 0,
        percent: 0,
      });
    }
    const row = bySubject.get(s.id)!;
    row.completedWeight += scoped.done;
    row.totalWeight += scoped.total;
  }

  return [...bySubject.values()].map((r) => ({
    ...r,
    percent:
      r.totalWeight > 0
        ? Math.round((r.completedWeight / r.totalWeight) * 100)
        : 0,
  }));
}

export type VelocityRow = {
  subjectId: string;
  name: string;
  color: string;
  weightPerDay: number;
  topicsPerDay: number;
  requiredPace?: number;
  onTrack?: boolean;
};

export async function getVelocity(
  objectiveId: string,
  windowDays = 14,
): Promise<VelocityRow[]> {
  const db = getDb();
  const today = todayString();
  const start = toDateString(subDays(new Date(), windowDays - 1));

  const events = await db.query.completionEvents.findMany({
    where: and(
      eq(completionEvents.objectiveId, objectiveId),
      gte(completionEvents.date, start),
      lte(completionEvents.date, today),
    ),
    with: { subject: true },
  });

  const subs = await db.query.subjects.findMany({
    where: eq(subjects.objectiveId, objectiveId),
  });

  const bySubject: Record<
    string,
    { weight: number; count: number }
  > = {};
  for (const s of subs) {
    bySubject[s.id] = { weight: 0, count: 0 };
  }
  for (const e of events) {
    bySubject[e.subjectId].weight += e.weightSnapshot;
    bySubject[e.subjectId].count += 1;
  }

  const objective = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  let phasePace: Record<string, number> | undefined;
  if (objective?.currentPhaseId) {
    const phase = await db.query.phases.findFirst({
      where: eq(phases.id, objective.currentPhaseId),
    });
    if (phase) {
      const progress = await getPhaseProgress(objectiveId, phase.id);
      const daysLeft = Math.max(
        1,
        Math.ceil(
          (new Date(phase.endDate).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        ),
      );
      phasePace = {};
      for (const p of progress) {
        const remaining = p.totalWeight - p.completedWeight;
        phasePace[p.subjectId] = remaining / daysLeft;
      }
    }
  }

  return subs.map((s) => {
    const w = bySubject[s.id].weight / windowDays;
    const c = bySubject[s.id].count / windowDays;
    const required = phasePace?.[s.id];
    return {
      subjectId: s.id,
      name: s.name,
      color: s.color,
      weightPerDay: Math.round(w * 10) / 10,
      topicsPerDay: Math.round(c * 100) / 100,
      requiredPace: required !== undefined ? Math.round(required * 10) / 10 : undefined,
      onTrack:
        required !== undefined ? w >= required * 0.9 : undefined,
    };
  });
}

export async function getPhaseSummary(objectiveId: string, phaseId: string) {
  const progress = await getPhaseProgress(objectiveId, phaseId);
  const topicCount = progress.length;
  const totalWeight = progress.reduce((s, p) => s + p.totalWeight, 0);
  const doneWeight = progress.reduce((s, p) => s + p.completedWeight, 0);
  return {
    topicCount,
    totalWeight,
    doneWeight,
    percent: totalWeight > 0 ? Math.round((doneWeight / totalWeight) * 100) : 0,
  };
}

export async function getSyllabusBuckets(objectiveId: string, phaseId?: string | null) {
  const db = getDb();
  const subs = await db.query.subjects.findMany({
    where: eq(subjects.objectiveId, objectiveId),
    orderBy: (s, { asc }) => [asc(s.sortOrder)],
    with: {
      topics: {
        with: {
          subtopics: {
            orderBy: (st, { asc }) => [asc(st.sortOrder)],
          },
        },
        orderBy: (t, { asc }) => [asc(t.sortOrder)],
      },
      backlogItems: {
        orderBy: (b, { asc }) => [asc(b.sortOrder)],
      },
    },
  });

  const phaseTopicIds = new Set<string>();
  if (phaseId) {
    const pts = await db.query.phaseTopics.findMany({
      where: eq(phaseTopics.phaseId, phaseId),
    });
    for (const p of pts) phaseTopicIds.add(p.topicId);
  }

  const volatile = await fetchVolatileTodayKeys(objectiveId);

  const active: typeof subs = [];
  const completed: typeof subs = [];

  for (const s of subs) {
    const activeTopics = s.topics.filter(
      (t) => !projectedIsTopicComplete(t, t.subtopics, volatile),
    );
    const doneTopics = s.topics.filter((t) =>
      projectedIsTopicComplete(t, t.subtopics, volatile),
    );
    // Always list every subject on Active so "+ topic" is visible even with zero topics.
    active.push({ ...s, topics: activeTopics });
    if (doneTopics.length) {
      completed.push({ ...s, topics: doneTopics });
    }
  }

  return { active, completed, phaseTopicIds, backlog: subs };
}
