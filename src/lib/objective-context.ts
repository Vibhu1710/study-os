import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { objectives } from "@/db/schema";
import { toDateString } from "@/lib/dates";
import {
  getActiveObjectiveId,
  isObjectiveArchivedByDate,
  syncObjectiveStatuses,
} from "@/lib/objective-lifecycle";

const BROWSE_COOKIE = "study_os_browse_objective";

export async function getBrowseObjectiveId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(BROWSE_COOKIE)?.value ?? null;
}

export async function setBrowseObjectiveId(id: string) {
  const db = getDb();
  const row = await db.query.objectives.findFirst({
    where: eq(objectives.id, id),
  });
  const today = toDateString(new Date());
  if (!row || !isObjectiveArchivedByDate(row.endDate, today)) {
    throw new Error("Only past cycles (end date before today) can be opened for viewing.");
  }
  const jar = await cookies();
  jar.set(BROWSE_COOKIE, id, { path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export async function clearBrowseObjective() {
  const jar = await cookies();
  jar.delete(BROWSE_COOKIE);
}

/** Objective shown in Calendar / Syllabus / Dashboard (active, or archived browse). */
export async function resolveObjectiveId(
  explicitId?: string | null,
): Promise<string | null> {
  if (explicitId) return explicitId;
  await syncObjectiveStatuses();
  const today = toDateString(new Date());

  const browseId = await getBrowseObjectiveId();
  if (browseId) {
    const db = getDb();
    const row = await db.query.objectives.findFirst({
      where: eq(objectives.id, browseId),
    });
    if (row && isObjectiveArchivedByDate(row.endDate, today)) return browseId;
    // Invalid/stale browse cookie — ignore (cannot delete cookies during layout render).
  }

  return getActiveObjectiveId();
}

export async function getWorkspaceMeta() {
  const activeId = await getActiveObjectiveId();
  const viewId = await resolveObjectiveId();
  const isArchiveView = Boolean(
    activeId && viewId && activeId !== viewId,
  );
  return { activeId, viewId, isArchiveView };
}


export function assertWritable(objective: { status: string; endDate: string }) {
  const today = toDateString(new Date());
  if (
    objective.status === "archived" ||
    isObjectiveArchivedByDate(objective.endDate, today)
  ) {
    throw new Error("This cycle is archived and read-only.");
  }
}
