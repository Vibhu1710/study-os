import Link from "next/link";
import { eq } from "drizzle-orm";
import { HomeWorkspace } from "@/components/home/HomeWorkspace";
import { getDb } from "@/db";
import { objectives, phaseTopics, phases } from "@/db/schema";
import {
  fetchCalendarStats,
  fetchDayDetail,
  fetchDayPlan,
  fetchPhaseScheduleMap,
} from "@/lib/actions/day";
import { fetchCompletionDates } from "@/lib/completion-dates";
import { parsePendingPhaseTopicIds } from "@/lib/phase-lifecycle";
import { ensureSubjectColorsDistinct, listSubjects } from "@/lib/actions/subjects";
import { migrateStudyNotesToGlobal } from "@/lib/syllabus-notes-migrate";
import { getCurrentObjectiveId } from "@/lib/actions/objectives";
import { syncPhaseForObjective } from "@/lib/phase-lifecycle";
import { toDateString } from "@/lib/dates";
import { isObjectiveArchivedByDate } from "@/lib/objective-lifecycle";
import { isTopicComplete } from "@/lib/progress";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const objectiveId = await getCurrentObjectiveId();

  if (!objectiveId) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <h1 className="text-xl font-semibold">Welcome to Study OS</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Create an objective (exam cycle) with a non-overlapping date range, then add subjects and
          topics.
        </p>
        <Link href="/settings" className="btn btn-primary mt-6 inline-flex">
          Create your first objective
        </Link>
      </div>
    );
  }

  const db = getDb();
  const objective = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  if (!objective) {
    return <p className="text-sm text-[var(--text-muted)]">Objective not found.</p>;
  }

  if (objective.status !== "archived") {
    await ensureSubjectColorsDistinct(objectiveId);
    await migrateStudyNotesToGlobal(objectiveId);
    await syncPhaseForObjective(objectiveId);
  }

  const objectiveFresh = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  if (!objectiveFresh) {
    return <p className="text-sm text-[var(--text-muted)]">Objective not found.</p>;
  }

  const selectedDate =
    params.date &&
    params.date >= objectiveFresh.startDate &&
    params.date <= objectiveFresh.endDate
      ? params.date
      : (() => {
          const today = toDateString(new Date());
          if (today >= objectiveFresh.startDate && today <= objectiveFresh.endDate) {
            return today;
          }
          return objectiveFresh.startDate;
        })();

  const phaseId = objectiveFresh.currentPhaseId;
  const currentPhase = phaseId
    ? await db.query.phases.findFirst({ where: eq(phases.id, phaseId) })
    : null;

  const currentPhaseTopicIds = phaseId
    ? (
        await db
          .select({ topicId: phaseTopics.topicId })
          .from(phaseTopics)
          .where(eq(phaseTopics.phaseId, phaseId))
      ).map((r) => r.topicId)
    : [];

  const [calendarStats, subjects, dayBundle, dayDetail, completionDates, phaseScheduleByTopic] =
    await Promise.all([
      fetchCalendarStats(objectiveId),
      listSubjects(objectiveId),
      fetchDayPlan(objectiveId, selectedDate),
      fetchDayDetail(objectiveId, selectedDate),
      fetchCompletionDates(objectiveId),
      fetchPhaseScheduleMap(objectiveId),
    ]);

  const pendingPhaseTopicIds = parsePendingPhaseTopicIds(
    objectiveFresh.pendingPhaseTopicIds,
  );

  const subjectList = subjects.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
  }));

  const syllabusTopics = subjects.flatMap((s) =>
    s.topics
      .filter((t) => !isTopicComplete(t, t.subtopics))
      .map((t) => ({ id: t.id, title: t.title, subjectName: s.name })),
  );

  return (
    <HomeWorkspace
      objectiveId={objectiveId}
      objectiveName={objectiveFresh.name}
      objectiveStart={objectiveFresh.startDate}
      objectiveEnd={objectiveFresh.endDate}
      readOnly={isObjectiveArchivedByDate(
        objectiveFresh.endDate,
        toDateString(new Date()),
      )}
      selectedDate={selectedDate}
      calendarStats={calendarStats}
      subjects={subjectList}
      currentPhase={currentPhase ?? null}
      completionDates={completionDates}
      pendingPhaseTopicIds={pendingPhaseTopicIds}
      homeSubjects={subjects.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        topics: s.topics.map((t) => ({
          id: t.id,
          subjectId: s.id,
          title: t.title,
          weight: t.weight,
          sortOrder: t.sortOrder,
          completedAt: t.completedAt,
          notes: t.notes,
          subtopics: t.subtopics.map((sub) => ({
            id: sub.id,
            title: sub.title,
            weight: sub.weight,
            completedAt: sub.completedAt,
            notes: sub.notes ?? null,
          })),
        })),
      }))}
      dayPlanItems={dayBundle.items as never}
      dayDetail={dayDetail as never}
      syllabusTopics={syllabusTopics}
      currentPhaseTopicIds={currentPhaseTopicIds}
      phaseScheduleByTopic={phaseScheduleByTopic}
    />
  );
}
