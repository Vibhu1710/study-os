import Link from "next/link";
import { eq } from "drizzle-orm";
import { SyllabusWorkspace } from "@/components/syllabus/SyllabusWorkspace";
import { getDb } from "@/db";
import { objectives } from "@/db/schema";
import { getSyllabusBuckets } from "@/lib/actions/analytics";
import { getCurrentObjectiveId } from "@/lib/actions/objectives";
import { syncPhaseForObjective } from "@/lib/phase-lifecycle";
import { isObjectiveArchivedByDate } from "@/lib/objective-lifecycle";
import { toDateString } from "@/lib/dates";
import { ensureSubjectColorsDistinct } from "@/lib/actions/subjects";
import { normalizeTopicWeightsForObjective } from "@/lib/syllabus-weight-normalize";
import { fetchCompletionDates } from "@/lib/completion-dates";
import { getCalendarDayStats } from "@/lib/services/day-plan";
import { getObjectivePhaseBounds } from "@/lib/services/phase-guard";

export default async function SyllabusPage() {
  const objectiveId = await getCurrentObjectiveId();
  if (!objectiveId) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        <Link href="/settings" className="text-[var(--accent)]">Create an objective</Link> in Settings first.
      </p>
    );
  }

  const db = getDb();
  const objective = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  if (!objective) return null;

  if (objective.status !== "archived") {
    await ensureSubjectColorsDistinct(objectiveId);
    await normalizeTopicWeightsForObjective(objectiveId);
  }

  if (objective.status !== "archived") {
    await syncPhaseForObjective(objectiveId);
  }
  const objectiveFresh = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  if (!objectiveFresh) return null;

  const today = toDateString(new Date());
  const [{ active, completed, phaseTopicIds, backlog }, completionDates, calendarDays, phaseBounds] =
    await Promise.all([
      getSyllabusBuckets(objectiveId, objectiveFresh.currentPhaseId),
      fetchCompletionDates(objectiveId),
      getCalendarDayStats(objectiveId),
      getObjectivePhaseBounds(objectiveId),
    ]);

  const activeTopicCount = active.reduce((n, s) => n + s.topics.length, 0);
  const subjectCount = backlog.length;

  const backlogSubjects = backlog.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    topics: [],
    backlogItems: s.backlogItems,
  }));

  return (
    <SyllabusWorkspace
      objectiveId={objectiveId}
      readOnly={isObjectiveArchivedByDate(objectiveFresh.endDate, today)}
      today={today}
      objectiveStart={objectiveFresh.startDate}
      objectiveEnd={objectiveFresh.endDate}
      phase={phaseBounds.phase}
      calendarDays={calendarDays}
      completionDates={completionDates}
      currentPhaseId={objectiveFresh.currentPhaseId}
      phaseTopicIds={[...phaseTopicIds]}
      active={active as never}
      completed={completed as never}
      backlogSubjects={backlogSubjects}
      activeTopicCount={activeTopicCount}
      subjectCount={subjectCount}
    />
  );
}
