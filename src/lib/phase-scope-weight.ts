import type { VolatileTodayKeys } from "@/lib/progress-projection";
import { roundWeightTenth } from "@/lib/weight";

export type ScopeIdSets = {
  topicIds: Set<string>;
  subtopicIds: Set<string>;
};

type WeightedUnit = {
  id: string;
  weight: number;
  completedAt: string | null;
};

/** Weight this phase still owed: units already finished before the phase are excluded. */
export function phaseScopedTopicWeights(
  topic: WeightedUnit,
  subs: WeightedUnit[],
  phaseStart: string,
  prior: ScopeIdSets,
  inPhase: ScopeIdSets,
  volatile: VolatileTodayKeys,
): {
  total: number;
  done: number;
  remaining: number;
  /** In-scope subtopics only. Both zero when the topic has none. */
  subtopicDone: number;
  subtopicTotal: number;
} {
  const finishedBefore = (completedAt: string | null) =>
    completedAt != null && completedAt.slice(0, 10) < phaseStart;

  if (subs.length === 0) {
    const loggedInPhase = inPhase.topicIds.has(topic.id);
    const alreadyDone =
      !loggedInPhase &&
      (prior.topicIds.has(topic.id) || finishedBefore(topic.completedAt));
    if (alreadyDone) {
      return {
        total: 0,
        done: 0,
        remaining: 0,
        subtopicDone: 0,
        subtopicTotal: 0,
      };
    }
    const done =
      Boolean(topic.completedAt) || volatile.topicIds.has(topic.id);
    const w = roundWeightTenth(topic.weight);
    return {
      total: w,
      done: done ? w : 0,
      remaining: done ? 0 : w,
      subtopicDone: 0,
      subtopicTotal: 0,
    };
  }

  let total = 0;
  let done = 0;
  let subtopicTotal = 0;
  let subtopicDone = 0;
  for (const sub of subs) {
    const loggedInPhase = inPhase.subtopicIds.has(sub.id);
    const alreadyDone =
      !loggedInPhase &&
      (prior.subtopicIds.has(sub.id) || finishedBefore(sub.completedAt));
    if (alreadyDone) continue;
    subtopicTotal += 1;
    total += sub.weight;
    if (sub.completedAt || volatile.subtopicIds.has(sub.id)) {
      done += sub.weight;
      subtopicDone += 1;
    }
  }
  return {
    total: roundWeightTenth(total),
    done: roundWeightTenth(done),
    remaining: roundWeightTenth(Math.max(0, total - done)),
    subtopicDone,
    subtopicTotal,
  };
}

export function scopeMarksFromEvents(
  events: { topicId: string; subtopicId: string | null; date: string }[],
  phaseStart: string,
  phaseEnd: string,
): { prior: ScopeIdSets; inPhase: ScopeIdSets } {
  const prior: ScopeIdSets = { topicIds: new Set(), subtopicIds: new Set() };
  const inPhase: ScopeIdSets = { topicIds: new Set(), subtopicIds: new Set() };
  for (const event of events) {
    const bucket =
      event.date < phaseStart
        ? prior
        : event.date <= phaseEnd
          ? inPhase
          : null;
    if (!bucket) continue;
    if (event.subtopicId) bucket.subtopicIds.add(event.subtopicId);
    else bucket.topicIds.add(event.topicId);
  }
  return { prior, inPhase };
}
