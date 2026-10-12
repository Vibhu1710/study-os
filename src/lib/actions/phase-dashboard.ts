"use server";

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import {
  completionEvents,
  dayPlanItems,
  dayPlans,
  objectives,
  phases,
  subjects,
} from "@/db/schema";
import { addDaysString, eachDateString, maxDateString } from "@/lib/dates";
import {
  getGlobalProgress,
  getPhaseProgress,
  type SubjectProgress,
} from "@/lib/actions/analytics";
import { projectedTopicCompletedWeight } from "@/lib/progress-projection";
import { topicTotalWeight } from "@/lib/progress";
import {
  remainingPlannedDayPlanItemWeight,
  type DayCompletionTouch,
} from "@/lib/schedule-weight";
import { rollForwardToDate } from "@/lib/services/day-plan";
import { roundWeightTenth } from "@/lib/weight";
import { todayString } from "@/lib/study-day";
import { fetchVolatileTodayKeys } from "@/lib/progress-projection-server";
import { phaseScopedTopicWeights, scopeMarksFromEvents } from "@/lib/phase-scope-weight";

export type PhaseDayPoint = {
  date: string;
  planned: number;
  completed: number;
  /** Rolling in-phase wt/day through this date; null for future days. */
  rolling5DayAvg: number | null;
  /** Wt/day needed from this date through phase end; null for future days. */
  requiredAsOfDay: number | null;
};

export type PhaseTopicRow = {
  topicId: string;
  title: string;
  subjectId: string;
  subjectName: string;
  subjectColor: string;
  totalWeight: number;
  completedWeight: number;
  remainingWeight: number;
  percent: number;
  lastLogDate: string | null;
  /** Zero when the topic has no subtopics. Counts only subtopics still in this phase. */
  subtopicDone: number;
  subtopicTotal: number;
};

export type PhaseSubjectPaceRow = {
  subjectId: string;
  name: string;
  color: string;
  remainingWeight: number;
  /** This subject's share of phase weight still left, 0–100. */
  shareOfRemainingPercent: number;
  /**
   * Share of weight logged in the phase so far, 0–100.
   * Null until enough phase days have elapsed.
   */
  attentionPercent: number | null;
  /** Weight per touch day over the last few sittings. Null if never touched. */
  sittingWt: number | null;
  /** How many touch days that sitting rate uses (1–5). */
  sittingDays: number;
  /** Remaining weight ÷ sitting rate. Null if there is no sitting yet. */
  sittingsLeft: number | null;
  /**
   * Weight still open at phase end if the phase-so-far daily rate continues.
   * Null until enough phase days have elapsed. Zero means it clears in phase.
   */
  unfinishedAtPhaseEnd: number | null;
};

export type PhaseSubjectPace = {
  /** Attention share and the phase-end forecast are stable enough to show. */
  ready: boolean;
  rows: PhaseSubjectPaceRow[];
};

export type PhaseAttentionReason = "missed" | "never" | "stalled";

export type PhaseAttentionTopicRow = {
  topicId: string;
  title: string;
  subjectName: string;
  subjectColor: string;
  remainingWeight: number;
  totalWeight: number;
  completedWeight: number;
  percent: number;
  lastLogDate: string | null;
  reason: PhaseAttentionReason;
  missedPlanDays: number;
  /** Past plan days that still count as missed. Empty unless reason is missed. */
  missedDates: string[];
  /** Every in-phase day this topic is on a plan, past and future. */
  scheduledDates: string[];
};

export type PhaseDashboardMeta = {
  phaseDayCount: number;
  elapsedInPhaseDays: number;
};

export type DashboardScope = "phase" | "cycle";

export type PhaseDashboardPayload = {
  scope: DashboardScope;
  today: string;
  phase: { id: string; name: string; startDate: string; endDate: string };
  summary: {
    totalWeight: number;
    doneWeight: number;
    remainingWeight: number;
    percent: number;
    /** Phase-end coverage if 5-day avg pace continues (capped at total). */
    projectedPercent: number;
    projectedDoneWeight: number;
    daysLeft: number;
  };
  days: PhaseDayPoint[];
  /** Tomorrow’s date in phase, if any. */
  tomorrow: string | null;
  /** Remaining wt ÷ days from tomorrow through phase end. */
  requiredFromTomorrow: number | null;
  pace: {
    requiredPerDay: number;
    current5DayAvg: number;
    spillover: number;
    /** spillover / current pace when both are positive. */
    extraDaysForSpillover: number | null;
    onTrack: boolean;
  };
  subjectPace: PhaseSubjectPace;
  attentionTopics: PhaseAttentionTopicRow[];
  meta: PhaseDashboardMeta;
  subjects: SubjectProgress[];
  topicsBySubject: Record<string, PhaseTopicRow[]>;
};

export type PhaseDayDetailPayload = {
  date: string;
  planned: {
    id: string;
    topicId: string;
    subtopicId: string | null;
    title: string;
    subtopicTitle: string | null;
    subjectName: string;
    subjectColor: string;
    weight: number;
  }[];
  completed: {
    topicId: string;
    title: string;
    subtopicTitle: string | null;
    subjectName: string;
    subjectColor: string;
    weight: number;
  }[];
};

async function loadPhaseContext(objectiveId: string, phaseId: string) {
  const db = getDb();
  const phase = await db.query.phases.findFirst({
    where: eq(phases.id, phaseId),
    with: {
      phaseTopics: {
        with: {
          topic: {
            with: { subject: true, subtopics: true },
          },
        },
      },
    },
  });
  if (!phase) return null;

  const topicIds = new Set(phase.phaseTopics.map((pt) => pt.topicId));
  const volatile = await fetchVolatileTodayKeys(objectiveId);
  const scopeEvents =
    topicIds.size === 0
      ? []
      : await db.query.completionEvents.findMany({
          where: and(
            eq(completionEvents.objectiveId, objectiveId),
            inArray(completionEvents.topicId, [...topicIds]),
          ),
        });
  const { prior, inPhase } = scopeMarksFromEvents(
    scopeEvents,
    phase.startDate,
    phase.endDate,
  );
  const topicsBySubject: Record<string, PhaseTopicRow[]> = {};

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
    const total = scoped.total;
    const completed = scoped.done;
    const remaining = scoped.remaining;
    if (total <= 0) continue;
    const row: PhaseTopicRow = {
      topicId: t.id,
      title: t.title,
      subjectId: s.id,
      subjectName: s.name,
      subjectColor: s.color,
      totalWeight: total,
      completedWeight: completed,
      remainingWeight: remaining,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
      lastLogDate: null,
      subtopicDone: scoped.subtopicDone,
      subtopicTotal: scoped.subtopicTotal,
    };
    if (!topicsBySubject[s.id]) topicsBySubject[s.id] = [];
    topicsBySubject[s.id].push(row);
  }

  return { phase, topicIds, topicsBySubject, volatile };
}

const ATTENTION_CAP = 6;
const STALLED_CAP = 2;
const REASON_RANK: Record<PhaseAttentionReason, number> = {
  missed: 0,
  never: 1,
  stalled: 2,
};

function selectAttentionTopics({
  topicsBySubject,
  phaseRemainingWeight,
  phaseDayCount,
  elapsedInPhaseDays,
  today,
  plannedPastDatesByTopic,
  scheduledDatesByTopic,
  loggedDatesByTopic,
}: {
  topicsBySubject: Record<string, PhaseTopicRow[]>;
  phaseRemainingWeight: number;
  phaseDayCount: number;
  elapsedInPhaseDays: number;
  today: string;
  plannedPastDatesByTopic: Map<string, Set<string>>;
  scheduledDatesByTopic: Map<string, Set<string>>;
  loggedDatesByTopic: Map<string, Set<string>>;
}): PhaseAttentionTopicRow[] {
  if (elapsedInPhaseDays < 2 || phaseRemainingWeight <= 0) return [];

  const incomplete = Object.values(topicsBySubject)
    .flat()
    .filter((t) => t.remainingWeight > 0);
  if (incomplete.length < 2) return [];

  const fairShare = 1 / incomplete.length;
  const heavyMultiplier = 1 + Math.min(0.5, (incomplete.length - 1) / 20);
  const heavyShare = Math.min(1, fairShare * heavyMultiplier);
  const neverAfterDays = Math.max(2, Math.ceil(phaseDayCount * 0.15));
  const stallDays = Math.min(14, Math.max(3, Math.round(phaseDayCount * 0.2)));
  const missWindowDays = Math.max(1, Math.round(phaseDayCount * 0.25));
  const stalledCutoff = addDaysString(today, -stallDays);
  const missCutoff = addDaysString(today, -missWindowDays);
  const candidates: PhaseAttentionTopicRow[] = [];

  for (const t of incomplete) {
    const share = t.remainingWeight / phaseRemainingWeight;
    if (share < heavyShare) continue;

    const plannedDates = plannedPastDatesByTopic.get(t.topicId);
    const loggedDates = loggedDatesByTopic.get(t.topicId);
    const neverLogged = t.lastLogDate == null;
    const missedDates: string[] = [];
    if (plannedDates) {
      for (const date of plannedDates) {
        if (loggedDates?.has(date)) continue;
        const loggedLater = loggedDates
          ? [...loggedDates].some((logged) => logged > date && logged <= today)
          : false;
        if (loggedLater) continue;
        if (!neverLogged && date < missCutoff) continue;
        missedDates.push(date);
      }
    }
    missedDates.sort();
    const missedPlanDays = missedDates.length;

    const never = neverLogged && elapsedInPhaseDays >= neverAfterDays;
    const stalled =
      t.lastLogDate != null && t.lastLogDate <= stalledCutoff;

    let reason: PhaseAttentionReason | null = null;
    if (missedPlanDays >= 1) reason = "missed";
    else if (never) reason = "never";
    else if (stalled) reason = "stalled";
    if (!reason) continue;

    candidates.push({
      topicId: t.topicId,
      title: t.title,
      subjectName: t.subjectName,
      subjectColor: t.subjectColor,
      remainingWeight: Math.round(t.remainingWeight * 10) / 10,
      totalWeight: Math.round(t.totalWeight * 10) / 10,
      completedWeight: Math.round(t.completedWeight * 10) / 10,
      percent: t.percent,
      lastLogDate: t.lastLogDate,
      reason,
      missedPlanDays,
      missedDates,
      scheduledDates: [...(scheduledDatesByTopic.get(t.topicId) ?? [])].sort(),
    });
  }

  candidates.sort((a, b) => {
    if (b.remainingWeight !== a.remainingWeight) {
      return b.remainingWeight - a.remainingWeight;
    }
    if (b.missedPlanDays !== a.missedPlanDays) {
      return b.missedPlanDays - a.missedPlanDays;
    }
    return REASON_RANK[a.reason] - REASON_RANK[b.reason];
  });

  const shown: PhaseAttentionTopicRow[] = [];
  let stalledCount = 0;
  for (const row of candidates) {
    if (row.reason === "stalled") {
      if (stalledCount >= STALLED_CAP) continue;
      stalledCount++;
    }
    shown.push(row);
    if (shown.length >= ATTENTION_CAP) break;
  }
  return shown;
}

function daysLeftInPhase(endDate: string, today: string): number {
  if (today > endDate) return 0;
  const dates = eachDateString(today, endDate);
  return Math.max(dates.length, 1);
}

function daysFromTomorrowThroughPhaseEnd(
  endDate: string,
  today: string,
): number {
  const tomorrow = addDaysString(today, 1);
  if (tomorrow > endDate) return 0;
  return eachDateString(tomorrow, endDate).length;
}

const PACE_READY_ELAPSED_DAYS = 4;
const SITTING_TOUCH_DAYS = 5;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function buildSubjectPace(input: {
  subjects: SubjectProgress[];
  events: { date: string; subjectId: string; weightSnapshot: number }[];
  today: string;
  elapsedInPhaseDays: number;
  daysLeft: number;
  remainingWeight: number;
}): PhaseSubjectPace {
  const loggedBySubjectDate = new Map<string, Map<string, number>>();
  for (const e of input.events) {
    if (e.date > input.today) continue;
    let byDate = loggedBySubjectDate.get(e.subjectId);
    if (!byDate) {
      byDate = new Map();
      loggedBySubjectDate.set(e.subjectId, byDate);
    }
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.weightSnapshot);
  }

  const loggedBySubject = new Map<string, number>();
  for (const [subjectId, byDate] of loggedBySubjectDate) {
    let sum = 0;
    for (const wt of byDate.values()) sum += wt;
    loggedBySubject.set(subjectId, sum);
  }
  const loggedAll = [...loggedBySubject.values()].reduce((s, n) => s + n, 0);
  const ready =
    input.elapsedInPhaseDays >= PACE_READY_ELAPSED_DAYS &&
    input.subjects.length >= 1;

  const rows: PhaseSubjectPaceRow[] = input.subjects
    .map((s) => {
      const remaining = Math.max(0, s.totalWeight - s.completedWeight);
      return { s, remaining };
    })
    .filter((row) => row.remaining > 0.05)
    .sort((a, b) => b.remaining - a.remaining)
    .map(({ s, remaining }) => {
      const byDate = loggedBySubjectDate.get(s.subjectId);
      const allTouchDates = byDate
        ? [...byDate.entries()]
            .filter(([, wt]) => wt > 0)
            .map(([date]) => date)
            .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
        : [];
      const rateDates = allTouchDates.slice(0, SITTING_TOUCH_DAYS);
      let sittingWt: number | null = null;
      let sittingsLeft: number | null = null;
      if (rateDates.length > 0 && byDate) {
        const sum = rateDates.reduce((n, date) => n + (byDate.get(date) ?? 0), 0);
        const rate = sum / rateDates.length;
        if (rate > 0) {
          sittingWt = round1(rate);
          sittingsLeft = round1(remaining / rate);
        }
      }
      const logged = loggedBySubject.get(s.subjectId) ?? 0;
      const shareOfRemainingPercent =
        input.remainingWeight > 0
          ? Math.round((remaining / input.remainingWeight) * 100)
          : 0;
      let attentionPercent: number | null = null;
      let unfinishedAtPhaseEnd: number | null = null;
      if (ready) {
        attentionPercent =
          loggedAll > 0 ? Math.round((logged / loggedAll) * 100) : 0;
        const daily =
          input.elapsedInPhaseDays > 0 ? logged / input.elapsedInPhaseDays : 0;
        unfinishedAtPhaseEnd = round1(
          Math.max(0, remaining - daily * input.daysLeft),
        );
      }
      return {
        subjectId: s.subjectId,
        name: s.name,
        color: s.color,
        remainingWeight: round1(remaining),
        shareOfRemainingPercent,
        attentionPercent,
        sittingWt,
        sittingDays: rateDates.length,
        sittingsLeft,
        unfinishedAtPhaseEnd,
      };
    });

  return { ready, rows };
}

/** Up to 5 calendar days ending on `through`, clipped to phase start; ÷ days in window. */
function rolling5DayAvgInPhase(
  completedByDate: Map<string, number>,
  through: string,
  phaseStart: string,
): number {
  const windowStart = maxDateString(addDaysString(through, -4), phaseStart);
  const windowDates = eachDateString(windowStart, through);
  if (windowDates.length === 0) return 0;
  const sum = windowDates.reduce(
    (s, d) => s + (completedByDate.get(d) ?? 0),
    0,
  );
  return Math.round((sum / windowDates.length) * 10) / 10;
}

export async function getPhaseDashboard(
  objectiveId: string,
  phaseId: string,
): Promise<PhaseDashboardPayload | null> {
  const ctx = await loadPhaseContext(objectiveId, phaseId);
  if (!ctx) return null;
  const { phase, topicIds } = ctx;
  const today = todayString();

  await rollForwardToDate(objectiveId, today);

  const subjects = await getPhaseProgress(objectiveId, phaseId);
  const totalWeight = subjects.reduce((s, p) => s + p.totalWeight, 0);
  const daysLeft = daysLeftInPhase(phase.endDate, today);

  const phaseDates = eachDateString(phase.startDate, phase.endDate);
  const topicIdList = [...topicIds];

  const db = getDb();
  const events =
    topicIdList.length === 0
      ? []
      : await db.query.completionEvents.findMany({
          where: and(
            eq(completionEvents.objectiveId, objectiveId),
            inArray(completionEvents.topicId, topicIdList),
            gte(completionEvents.date, phase.startDate),
            lte(completionEvents.date, phase.endDate),
          ),
          with: { topic: true, subtopic: true, subject: true },
        });

  const completedByDate = new Map<string, number>();
  const lastLogByTopic = new Map<string, string>();
  const loggedDatesByTopic = new Map<string, Set<string>>();
  for (const e of events) {
    completedByDate.set(
      e.date,
      (completedByDate.get(e.date) ?? 0) + e.weightSnapshot,
    );
    const prev = lastLogByTopic.get(e.topicId);
    if (!prev || e.date > prev) lastLogByTopic.set(e.topicId, e.date);
    let loggedDates = loggedDatesByTopic.get(e.topicId);
    if (!loggedDates) {
      loggedDates = new Set();
      loggedDatesByTopic.set(e.topicId, loggedDates);
    }
    loggedDates.add(e.date);
  }

  for (const rows of Object.values(ctx.topicsBySubject)) {
    for (const row of rows) {
      row.lastLogDate = lastLogByTopic.get(row.topicId) ?? null;
    }
  }

  const plans = await db.query.dayPlans.findMany({
    where: and(
      eq(dayPlans.objectiveId, objectiveId),
      gte(dayPlans.date, phase.startDate),
      lte(dayPlans.date, phase.endDate),
    ),
    with: {
      items: {
        with: {
          topic: { with: { subtopics: true, subject: true } },
          subtopic: true,
        },
      },
    },
  });

  const doneWeight = subjects.reduce((s, p) => s + p.completedWeight, 0);
  const remainingWeight = Math.max(0, totalWeight - doneWeight);

  const plannedByDate = new Map<string, number>();
  const plannedPastDatesByTopic = new Map<string, Set<string>>();
  const scheduledDatesByTopic = new Map<string, Set<string>>();
  for (const plan of plans) {
    const touches: DayCompletionTouch[] = events
      .filter((ev) => ev.date === plan.date)
      .map((ev) => ({
        topicId: ev.topicId,
        subtopicId: ev.subtopicId,
        weight: ev.weightSnapshot,
      }));
    let sum = 0;
    for (const item of plan.items) {
      if (item.status !== "planned") continue;
      if (!topicIds.has(item.topicId)) continue;
      let scheduled = scheduledDatesByTopic.get(item.topicId);
      if (!scheduled) {
        scheduled = new Set();
        scheduledDatesByTopic.set(item.topicId, scheduled);
      }
      scheduled.add(plan.date);
      if (plan.date < today) {
        let plannedDates = plannedPastDatesByTopic.get(item.topicId);
        if (!plannedDates) {
          plannedDates = new Set();
          plannedPastDatesByTopic.set(item.topicId, plannedDates);
        }
        plannedDates.add(plan.date);
      }
      const sub = item.subtopicId
        ? item.topic.subtopics.find((s) => s.id === item.subtopicId)
        : null;
      sum += remainingPlannedDayPlanItemWeight(
        { topic: item.topic, subtopic: sub ?? null },
        plan.date,
        today,
        touches,
      );
    }
    if (sum > 0) plannedByDate.set(plan.date, sum);
  }

  const elapsedInPhaseDays = phaseDates.filter((d) => d <= today).length;
  const phaseDayCount = phaseDates.length;

  const subjectPace = buildSubjectPace({
    subjects,
    events,
    today,
    elapsedInPhaseDays,
    daysLeft,
    remainingWeight,
  });

  const attentionTopics = selectAttentionTopics({
    topicsBySubject: ctx.topicsBySubject,
    phaseRemainingWeight: remainingWeight,
    phaseDayCount,
    elapsedInPhaseDays,
    today,
    plannedPastDatesByTopic,
    scheduledDatesByTopic,
    loggedDatesByTopic,
  });

  const meta: PhaseDashboardMeta = {
    phaseDayCount,
    elapsedInPhaseDays,
  };

  const completedOnly = phaseDates
    .filter((date) => date <= today)
    .map((date) => ({
      date,
      planned: Math.round((plannedByDate.get(date) ?? 0) * 10) / 10,
      completed: Math.round((completedByDate.get(date) ?? 0) * 10) / 10,
    }));
  const current5DayAvg = rolling5DayAvgInPhase(
    completedByDate,
    today,
    phase.startDate,
  );

  const forecastWeight = Math.max(
    0,
    current5DayAvg * daysFromTomorrowThroughPhaseEnd(phase.endDate, today),
  );

  const requiredPerDay =
    daysLeft > 0
      ? Math.round((remainingWeight / daysLeft) * 10) / 10
      : remainingWeight;

  const spillover = Math.max(
    0,
    Math.round((remainingWeight - forecastWeight) * 10) / 10,
  );

  const extraDaysForSpillover =
    spillover > 0 && current5DayAvg > 0
      ? Math.round((spillover / current5DayAvg) * 10) / 10
      : null;

  const projectedAdditional = Math.min(remainingWeight, forecastWeight);
  const projectedDoneWeight = Math.min(
    totalWeight,
    doneWeight + projectedAdditional,
  );
  const projectedPercent =
    totalWeight > 0
      ? Math.min(
          100,
          Math.round((projectedDoneWeight / totalWeight) * 100),
        )
      : 0;

  const paceByDate = new Map<
    string,
    { rolling5DayAvg: number; requiredAsOfDay: number }
  >();
  for (const point of completedOnly) {
    const date = point.date;
    const rolling = rolling5DayAvgInPhase(
      completedByDate,
      date,
      phase.startDate,
    );
    const doneThrough = completedOnly
      .filter((d) => d.date <= date)
      .reduce((s, d) => s + d.completed, 0);
    const remAtDay = Math.max(0, totalWeight - doneThrough);
    const daysLeftAtDay = eachDateString(date, phase.endDate).length;
    const req =
      daysLeftAtDay > 0
        ? Math.round((remAtDay / daysLeftAtDay) * 10) / 10
        : 0;
    paceByDate.set(date, {
      rolling5DayAvg: rolling,
      requiredAsOfDay: req,
    });
  }

  const days: PhaseDayPoint[] = phaseDates.map((date) => {
    const pace = paceByDate.get(date);
    return {
      date,
      planned: Math.round((plannedByDate.get(date) ?? 0) * 10) / 10,
      completed: Math.round((completedByDate.get(date) ?? 0) * 10) / 10,
      rolling5DayAvg: pace?.rolling5DayAvg ?? null,
      requiredAsOfDay: pace?.requiredAsOfDay ?? null,
    };
  });

  const tomorrow = addDaysString(today, 1);
  const daysFutureCount = daysFromTomorrowThroughPhaseEnd(phase.endDate, today);
  const requiredFromTomorrow =
    daysFutureCount > 0 && tomorrow <= phase.endDate
      ? Math.round((remainingWeight / daysFutureCount) * 10) / 10
      : null;

  return {
    scope: "phase",
    today,
    phase: {
      id: phase.id,
      name: phase.name,
      startDate: phase.startDate,
      endDate: phase.endDate,
    },
    summary: {
      totalWeight: roundWeightTenth(totalWeight),
      doneWeight: roundWeightTenth(doneWeight),
      remainingWeight: roundWeightTenth(remainingWeight),
      percent:
        totalWeight > 0 ? Math.round((doneWeight / totalWeight) * 100) : 0,
      projectedDoneWeight: roundWeightTenth(projectedDoneWeight),
      projectedPercent,
      daysLeft,
    },
    days,
    tomorrow: tomorrow <= phase.endDate ? tomorrow : null,
    requiredFromTomorrow,
    pace: {
      requiredPerDay,
      current5DayAvg,
      spillover,
      extraDaysForSpillover,
      onTrack: current5DayAvg >= requiredPerDay * 0.9,
    },
    subjectPace,
    attentionTopics,
    meta,
    subjects,
    topicsBySubject: ctx.topicsBySubject,
  };
}

export async function getPhaseDayDetail(
  objectiveId: string,
  phaseId: string,
  date: string,
): Promise<PhaseDayDetailPayload | null> {
  const ctx = await loadPhaseContext(objectiveId, phaseId);
  if (!ctx) return null;
  const { topicIds } = ctx;
  const today = todayString();
  await rollForwardToDate(objectiveId, today);

  const db = getDb();
  const events = await db.query.completionEvents.findMany({
    where: and(
      eq(completionEvents.objectiveId, objectiveId),
      eq(completionEvents.date, date),
      inArray(completionEvents.topicId, [...topicIds]),
    ),
    with: { topic: true, subtopic: true, subject: true },
  });

  const plan = await db.query.dayPlans.findFirst({
    where: and(eq(dayPlans.objectiveId, objectiveId), eq(dayPlans.date, date)),
    with: {
      items: {
        with: {
          topic: { with: { subtopics: true, subject: true } },
          subtopic: true,
        },
      },
    },
  });

  const touches: DayCompletionTouch[] = events.map((e) => ({
    topicId: e.topicId,
    subtopicId: e.subtopicId,
    weight: e.weightSnapshot,
  }));

  const planned: PhaseDayDetailPayload["planned"] = [];
  for (const item of plan?.items ?? []) {
    if (item.status !== "planned") continue;
    if (!topicIds.has(item.topicId)) continue;
    const sub = item.subtopicId
      ? item.topic.subtopics.find((s) => s.id === item.subtopicId)
      : null;
    const w = remainingPlannedDayPlanItemWeight(
      { topic: item.topic, subtopic: sub ?? null },
      date,
      today,
      touches,
    );
    if (w <= 0) continue;
    planned.push({
      id: item.id,
      topicId: item.topicId,
      subtopicId: item.subtopicId,
      title: item.topic.title,
      subtopicTitle: sub?.title ?? null,
      subjectName: item.topic.subject.name,
      subjectColor: item.topic.subject.color,
      weight: Math.round(w * 10) / 10,
    });
  }

  const completed = events.map((e) => ({
    topicId: e.topicId,
    title: e.topic.title,
    subtopicTitle: e.subtopic?.title ?? null,
    subjectName: e.subject.name,
    subjectColor: e.subject.color,
    weight: e.weightSnapshot,
  }));

  return { date, planned, completed };
}

function dashboardAsOfToday(
  windowStart: string,
  windowEnd: string,
  realToday: string,
): string {
  if (realToday > windowEnd) return windowEnd;
  if (realToday < windowStart) return windowStart;
  return realToday;
}

async function loadObjectiveContext(objectiveId: string) {
  const db = getDb();
  const objective = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  if (!objective) return null;

  const volatile = await fetchVolatileTodayKeys(objectiveId);
  const subjectRows = await db.query.subjects.findMany({
    where: eq(subjects.objectiveId, objectiveId),
    with: { topics: { with: { subtopics: true } } },
  });

  const topicIds = new Set<string>();
  const topicsBySubject: Record<string, PhaseTopicRow[]> = {};

  for (const s of subjectRows) {
    for (const t of s.topics) {
      topicIds.add(t.id);
      const total = topicTotalWeight(t, t.subtopics);
      if (total <= 0) continue;
      const completed = projectedTopicCompletedWeight(t, t.subtopics, volatile);
      const remaining = Math.max(0, total - completed);
      const row: PhaseTopicRow = {
        topicId: t.id,
        title: t.title,
        subjectId: s.id,
        subjectName: s.name,
        subjectColor: s.color,
        totalWeight: total,
        completedWeight: completed,
        remainingWeight: remaining,
        percent: total > 0 ? Math.round((completed / total) * 100) : 0,
        lastLogDate: null,
        subtopicDone: t.subtopics.filter((sub) => sub.completedAt).length,
        subtopicTotal: t.subtopics.length,
      };
      if (!topicsBySubject[s.id]) topicsBySubject[s.id] = [];
      topicsBySubject[s.id].push(row);
    }
  }

  return { objective, topicIds, topicsBySubject };
}

/** Full study cycle — all syllabus topics, no needs-attention card. */
export async function getObjectiveDashboard(
  objectiveId: string,
): Promise<PhaseDashboardPayload | null> {
  const ctx = await loadObjectiveContext(objectiveId);
  if (!ctx) return null;
  const { objective, topicIds, topicsBySubject } = ctx;
  const windowStart = objective.startDate;
  const windowEnd = objective.endDate;
  const realToday = todayString();
  const today = dashboardAsOfToday(windowStart, windowEnd, realToday);

  if (realToday >= windowStart && realToday <= windowEnd) {
    await rollForwardToDate(objectiveId, realToday);
  }

  const subjects = await getGlobalProgress(objectiveId);
  const totalWeight = subjects.reduce((s, p) => s + p.totalWeight, 0);
  const daysLeft = daysLeftInPhase(windowEnd, today);

  const windowDates = eachDateString(windowStart, windowEnd);
  const topicIdList = [...topicIds];

  const db = getDb();
  const events =
    topicIdList.length === 0
      ? []
      : await db.query.completionEvents.findMany({
          where: and(
            eq(completionEvents.objectiveId, objectiveId),
            gte(completionEvents.date, windowStart),
            lte(completionEvents.date, windowEnd),
          ),
          with: { topic: true, subtopic: true, subject: true },
        });

  const completedByDate = new Map<string, number>();
  const lastLogByTopic = new Map<string, string>();
  for (const e of events) {
    completedByDate.set(
      e.date,
      (completedByDate.get(e.date) ?? 0) + e.weightSnapshot,
    );
    const prev = lastLogByTopic.get(e.topicId);
    if (!prev || e.date > prev) lastLogByTopic.set(e.topicId, e.date);
  }

  for (const rows of Object.values(topicsBySubject)) {
    for (const row of rows) {
      row.lastLogDate = lastLogByTopic.get(row.topicId) ?? null;
    }
  }

  const plans = await db.query.dayPlans.findMany({
    where: and(
      eq(dayPlans.objectiveId, objectiveId),
      gte(dayPlans.date, windowStart),
      lte(dayPlans.date, windowEnd),
    ),
    with: {
      items: {
        with: {
          topic: { with: { subtopics: true, subject: true } },
          subtopic: true,
        },
      },
    },
  });

  const doneWeight = subjects.reduce((s, p) => s + p.completedWeight, 0);
  const remainingWeight = Math.max(0, totalWeight - doneWeight);

  const plannedByDate = new Map<string, number>();
  for (const plan of plans) {
    const touches: DayCompletionTouch[] = events
      .filter((ev) => ev.date === plan.date)
      .map((ev) => ({
        topicId: ev.topicId,
        subtopicId: ev.subtopicId,
        weight: ev.weightSnapshot,
      }));
    let sum = 0;
    for (const item of plan.items) {
      if (item.status !== "planned") continue;
      const sub = item.subtopicId
        ? item.topic.subtopics.find((s) => s.id === item.subtopicId)
        : null;
      sum += remainingPlannedDayPlanItemWeight(
        { topic: item.topic, subtopic: sub ?? null },
        plan.date,
        today,
        touches,
      );
    }
    if (sum > 0) plannedByDate.set(plan.date, sum);
  }

  const elapsedInPhaseDays = windowDates.filter((d) => d <= today).length;
  const phaseDayCount = windowDates.length;

  const subjectPace = buildSubjectPace({
    subjects,
    events,
    today,
    elapsedInPhaseDays,
    daysLeft,
    remainingWeight,
  });

  const meta: PhaseDashboardMeta = {
    phaseDayCount,
    elapsedInPhaseDays,
  };

  const completedOnly = windowDates
    .filter((date) => date <= today)
    .map((date) => ({
      date,
      planned: Math.round((plannedByDate.get(date) ?? 0) * 10) / 10,
      completed: Math.round((completedByDate.get(date) ?? 0) * 10) / 10,
    }));

  const current5DayAvg = rolling5DayAvgInPhase(
    completedByDate,
    today,
    windowStart,
  );

  const forecastWeight = Math.max(
    0,
    current5DayAvg * daysFromTomorrowThroughPhaseEnd(windowEnd, today),
  );

  const requiredPerDay =
    daysLeft > 0
      ? Math.round((remainingWeight / daysLeft) * 10) / 10
      : remainingWeight;

  const spillover = Math.max(
    0,
    Math.round((remainingWeight - forecastWeight) * 10) / 10,
  );

  const extraDaysForSpillover =
    spillover > 0 && current5DayAvg > 0
      ? Math.round((spillover / current5DayAvg) * 10) / 10
      : null;

  const projectedAdditional = Math.min(remainingWeight, forecastWeight);
  const projectedDoneWeight = Math.min(
    totalWeight,
    doneWeight + projectedAdditional,
  );
  const projectedPercent =
    totalWeight > 0
      ? Math.min(
          100,
          Math.round((projectedDoneWeight / totalWeight) * 100),
        )
      : 0;

  const paceByDate = new Map<
    string,
    { rolling5DayAvg: number; requiredAsOfDay: number }
  >();
  for (const point of completedOnly) {
    const date = point.date;
    const rolling = rolling5DayAvgInPhase(
      completedByDate,
      date,
      windowStart,
    );
    const doneThrough = completedOnly
      .filter((d) => d.date <= date)
      .reduce((s, d) => s + d.completed, 0);
    const remAtDay = Math.max(0, totalWeight - doneThrough);
    const daysLeftAtDay = eachDateString(date, windowEnd).length;
    const req =
      daysLeftAtDay > 0
        ? Math.round((remAtDay / daysLeftAtDay) * 10) / 10
        : 0;
    paceByDate.set(date, {
      rolling5DayAvg: rolling,
      requiredAsOfDay: req,
    });
  }

  const days: PhaseDayPoint[] = windowDates.map((date) => {
    const pace = paceByDate.get(date);
    return {
      date,
      planned: Math.round((plannedByDate.get(date) ?? 0) * 10) / 10,
      completed: Math.round((completedByDate.get(date) ?? 0) * 10) / 10,
      rolling5DayAvg: pace?.rolling5DayAvg ?? null,
      requiredAsOfDay: pace?.requiredAsOfDay ?? null,
    };
  });

  const tomorrow = addDaysString(today, 1);
  const daysFutureCount = daysFromTomorrowThroughPhaseEnd(windowEnd, today);
  const requiredFromTomorrow =
    daysFutureCount > 0 && tomorrow <= windowEnd
      ? Math.round((remainingWeight / daysFutureCount) * 10) / 10
      : null;

  return {
    scope: "cycle",
    today,
    phase: {
      id: objective.id,
      name: objective.name,
      startDate: windowStart,
      endDate: windowEnd,
    },
    summary: {
      totalWeight: roundWeightTenth(totalWeight),
      doneWeight: roundWeightTenth(doneWeight),
      remainingWeight: roundWeightTenth(remainingWeight),
      percent:
        totalWeight > 0 ? Math.round((doneWeight / totalWeight) * 100) : 0,
      projectedDoneWeight: roundWeightTenth(projectedDoneWeight),
      projectedPercent,
      daysLeft,
    },
    days,
    tomorrow: tomorrow <= windowEnd ? tomorrow : null,
    requiredFromTomorrow,
    pace: {
      requiredPerDay,
      current5DayAvg,
      spillover,
      extraDaysForSpillover,
      onTrack: current5DayAvg >= requiredPerDay * 0.9,
    },
    subjectPace,
    attentionTopics: [],
    meta,
    subjects,
    topicsBySubject,
  };
}

export async function getObjectiveDayDetail(
  objectiveId: string,
  date: string,
): Promise<PhaseDayDetailPayload | null> {
  const ctx = await loadObjectiveContext(objectiveId);
  if (!ctx) return null;
  const { objective } = ctx;
  if (date < objective.startDate || date > objective.endDate) return null;

  const realToday = todayString();
  const today = dashboardAsOfToday(
    objective.startDate,
    objective.endDate,
    realToday,
  );
  if (realToday >= objective.startDate && realToday <= objective.endDate) {
    await rollForwardToDate(objectiveId, realToday);
  }

  const db = getDb();
  const events = await db.query.completionEvents.findMany({
    where: and(
      eq(completionEvents.objectiveId, objectiveId),
      eq(completionEvents.date, date),
    ),
    with: { topic: true, subtopic: true, subject: true },
  });

  const plan = await db.query.dayPlans.findFirst({
    where: and(eq(dayPlans.objectiveId, objectiveId), eq(dayPlans.date, date)),
    with: {
      items: {
        with: {
          topic: { with: { subtopics: true, subject: true } },
          subtopic: true,
        },
      },
    },
  });

  const touches: DayCompletionTouch[] = events.map((e) => ({
    topicId: e.topicId,
    subtopicId: e.subtopicId,
    weight: e.weightSnapshot,
  }));

  const planned: PhaseDayDetailPayload["planned"] = [];
  for (const item of plan?.items ?? []) {
    if (item.status !== "planned") continue;
    const sub = item.subtopicId
      ? item.topic.subtopics.find((s) => s.id === item.subtopicId)
      : null;
    const w = remainingPlannedDayPlanItemWeight(
      { topic: item.topic, subtopic: sub ?? null },
      date,
      today,
      touches,
    );
    if (w <= 0) continue;
    planned.push({
      id: item.id,
      topicId: item.topicId,
      subtopicId: item.subtopicId,
      title: item.topic.title,
      subtopicTitle: sub?.title ?? null,
      subjectName: item.topic.subject.name,
      subjectColor: item.topic.subject.color,
      weight: Math.round(w * 10) / 10,
    });
  }

  const completed = events.map((e) => ({
    topicId: e.topicId,
    title: e.topic.title,
    subtopicTitle: e.subtopic?.title ?? null,
    subjectName: e.subject.name,
    subjectColor: e.subject.color,
    weight: e.weightSnapshot,
  }));

  return { date, planned, completed };
}
