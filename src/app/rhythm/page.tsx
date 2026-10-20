import Link from "next/link";
import { eq } from "drizzle-orm";
import { RhythmWorkspace } from "@/components/rhythm/RhythmWorkspace";
import { getDb } from "@/db";
import { objectives, phases } from "@/db/schema";
import { fetchCalendarStats } from "@/lib/actions/day";
import { getCurrentObjectiveId } from "@/lib/actions/objectives";
import {
  fetchRhythmAggregates,
  fetchRhythmSessions,
} from "@/lib/actions/rhythm";
import { toDateString } from "@/lib/dates";
import { isObjectiveArchivedByDate } from "@/lib/objective-lifecycle";
import { resolveRhythmConfigForObjective } from "@/lib/services/rhythm-config";
import {
  buildEffortCalendarDays,
  mergeRhythmIntoCoverageDays,
} from "@/lib/rhythm/calendar-merge";
import { recordToDayState } from "@/lib/rhythm/session-state";

export default async function RhythmPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const objectiveId = await getCurrentObjectiveId();
  if (!objectiveId) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        <Link href="/settings" className="text-[var(--accent)]">
          Create an objective
        </Link>{" "}
        in Settings first.
      </p>
    );
  }

  const db = getDb();
  const objective = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  if (!objective) return null;

  const today = toDateString(new Date());
  const selectedDate =
    params.date &&
    params.date >= objective.startDate &&
    params.date <= objective.endDate &&
    params.date <= today
      ? params.date
      : today >= objective.startDate && today <= objective.endDate
        ? today
        : objective.startDate;

  const phaseId = objective.currentPhaseId;
  const currentPhase = phaseId
    ? await db.query.phases.findFirst({ where: eq(phases.id, phaseId) })
    : null;

  const [sessions, sandglass, aggregates, coverageRaw] = await Promise.all([
    fetchRhythmSessions(objectiveId),
    resolveRhythmConfigForObjective(objectiveId),
    fetchRhythmAggregates(objectiveId),
    fetchCalendarStats(objectiveId),
  ]);

  const coverageDays = mergeRhythmIntoCoverageDays(coverageRaw, sessions, sandglass);
  const effortDays = buildEffortCalendarDays(coverageDays, sessions, sandglass);

  const sessionDtos = sessions.map((s) => ({
    date: s.date,
    ...recordToDayState(s),
  }));

  return (
    <RhythmWorkspace
      objectiveId={objectiveId}
      objectiveStart={objective.startDate}
      objectiveEnd={objective.endDate}
      readOnly={isObjectiveArchivedByDate(objective.endDate, today)}
      today={today}
      selectedDate={selectedDate}
      coverageDays={coverageDays}
      effortDays={effortDays}
      sessions={sessionDtos}
      sandglass={sandglass}
      aggregates={aggregates}
      phaseStart={currentPhase?.startDate ?? null}
      phaseEnd={currentPhase?.endDate ?? null}
      phaseName={currentPhase?.name ?? null}
    />
  );
}
