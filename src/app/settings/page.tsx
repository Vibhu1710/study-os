import { SettingsWorkspace } from "@/components/settings/SettingsWorkspace";
import { getWorkspaceState, listObjectives } from "@/lib/actions/objectives";
import {
  getLiveObjectiveRecord,
  getReactivatableArchivedObjective,
} from "@/lib/objective-lifecycle";
import { toDateString } from "@/lib/dates";

export default async function SettingsPage() {
  const today = toDateString(new Date());
  const [objectives, workspace, live, reactivatable] = await Promise.all([
    listObjectives(),
    getWorkspaceState(),
    getLiveObjectiveRecord(),
    getReactivatableArchivedObjective(),
  ]);

  const liveDto = live
    ? objectives.find((o) => o.id === live.id) ?? {
        id: live.id,
        name: live.name,
        description: live.description,
        startDate: live.startDate,
        endDate: live.endDate,
        status: live.status,
      }
    : null;

  const reactivatableDto = reactivatable
    ? objectives.find((o) => o.id === reactivatable.id) ?? {
        id: reactivatable.id,
        name: reactivatable.name,
        description: reactivatable.description,
        startDate: reactivatable.startDate,
        endDate: reactivatable.endDate,
        status: reactivatable.status,
      }
    : null;

  return (
    <SettingsWorkspace
      objectives={objectives}
      liveObjective={liveDto}
      reactivatableObjective={reactivatableDto}
      viewId={workspace.viewId}
      isArchiveView={workspace.isArchiveView}
      today={today}
    />
  );
}
