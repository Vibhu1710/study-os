import Link from "next/link";
import { eq } from "drizzle-orm";
import { DashboardWorkspace } from "@/components/dashboard/DashboardWorkspace";
import { getDb } from "@/db";
import { objectives } from "@/db/schema";
import {
  getObjectiveDashboard,
  getPhaseDashboard,
} from "@/lib/actions/phase-dashboard";
import {
  getCurrentObjectiveId,
  getWorkspaceState,
} from "@/lib/actions/objectives";

export default async function DashboardPage() {
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

  const { isArchiveView } = await getWorkspaceState();
  const phaseToggleEnabled = Boolean(
    objective.currentPhaseId && !isArchiveView,
  );

  const [cycleData, phaseData] = await Promise.all([
    getObjectiveDashboard(objectiveId),
    phaseToggleEnabled && objective.currentPhaseId
      ? getPhaseDashboard(objectiveId, objective.currentPhaseId)
      : Promise.resolve(null),
  ]);

  if (!cycleData) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Dashboard data unavailable.
      </p>
    );
  }

  return (
    <DashboardWorkspace
      objectiveId={objectiveId}
      cycleData={cycleData}
      phaseData={phaseData}
      phaseToggleEnabled={phaseToggleEnabled}
      defaultScope={phaseToggleEnabled ? "phase" : "cycle"}
    />
  );
}
