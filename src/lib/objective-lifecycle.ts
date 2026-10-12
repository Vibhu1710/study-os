import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { objectives } from "@/db/schema";
import { addDaysString, toDateString } from "@/lib/dates";

/** Archived ⇔ calendar end date is strictly before today (last day inclusive). */
export function isObjectiveArchivedByDate(
  endDate: string,
  today: string = toDateString(new Date()),
): boolean {
  return today > endDate;
}

export function isObjectiveLiveByDate(
  endDate: string,
  today: string = toDateString(new Date()),
): boolean {
  return !isObjectiveArchivedByDate(endDate, today);
}

function pickPrimaryLiveObjective<
  T extends { id: string; startDate: string; endDate: string; status: string },
>(rows: T[], today: string): T | null {
  const live = rows.filter((o) => isObjectiveLiveByDate(o.endDate, today));
  if (live.length === 0) return null;
  const activeFlagged = live.filter((o) => o.status === "active");
  const pool = activeFlagged.length > 0 ? activeFlagged : live;
  return [...pool].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
}

/** Status follows end date; exactly one row stays `active` among live-by-date cycles. */
export async function syncObjectiveStatuses() {
  const db = getDb();
  const today = toDateString(new Date());
  const all = await db.query.objectives.findMany();
  const primary = pickPrimaryLiveObjective(all, today);

  for (const o of all) {
    const pastEnd = isObjectiveArchivedByDate(o.endDate, today);
    const nextStatus = pastEnd
      ? "archived"
      : primary && o.id === primary.id
        ? "active"
        : "archived";
    if (o.status !== nextStatus) {
      await db
        .update(objectives)
        .set({ status: nextStatus })
        .where(eq(objectives.id, o.id));
    }
  }
}

export async function getLiveObjectiveRecord() {
  await syncObjectiveStatuses();
  const db = getDb();
  const today = toDateString(new Date());
  const all = await db.query.objectives.findMany();
  return pickPrimaryLiveObjective(all, today);
}

export async function getActiveObjectiveId(): Promise<string | null> {
  const live = await getLiveObjectiveRecord();
  return live?.id ?? null;
}

/**
 * When no cycle is live-by-date, the archived cycle with the latest end date is the one that
 * just ended (calendar archive). Only that row may be reopened by extending its end date.
 */
export function pickReactivatableArchivedObjective<
  T extends { id: string; startDate: string; endDate: string },
>(rows: T[], today: string = toDateString(new Date())): T | null {
  if (rows.some((o) => isObjectiveLiveByDate(o.endDate, today))) return null;
  const archived = rows.filter((o) => isObjectiveArchivedByDate(o.endDate, today));
  if (archived.length === 0) return null;
  return [...archived].sort((a, b) => {
    const byEnd = b.endDate.localeCompare(a.endDate);
    if (byEnd !== 0) return byEnd;
    return b.startDate.localeCompare(a.startDate);
  })[0];
}

export async function getReactivatableArchivedObjective() {
  await syncObjectiveStatuses();
  const db = getDb();
  const today = toDateString(new Date());
  const all = await db.query.objectives.findMany();
  return pickReactivatableArchivedObjective(all, today);
}

/** Keep a single live cycle; demote extras by moving their end date into the past. */
export async function assertSingleActiveInvariant() {
  const db = getDb();
  const today = toDateString(new Date());
  const all = await db.query.objectives.findMany();
  const live = all.filter((o) => isObjectiveLiveByDate(o.endDate, today));
  if (live.length <= 1) return;

  const sorted = [...live].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const [, ...demote] = sorted;
  const pastEnd = addDaysString(today, -1);
  for (const o of demote) {
    await db
      .update(objectives)
      .set({ endDate: pastEnd })
      .where(eq(objectives.id, o.id));
  }
  await syncObjectiveStatuses();
}
