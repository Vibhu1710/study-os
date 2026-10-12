"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, newId, nowIso } from "@/db";
import { objectives } from "@/db/schema";
import { datesOverlap } from "@/lib/dates";
import {
  addDaysString,
  inclusiveDayCount,
  MIN_OBJECTIVE_DAYS,
  toDateString,
} from "@/lib/dates";
import {
  assertSingleActiveInvariant,
  getActiveObjectiveId,
  getLiveObjectiveRecord,
  isObjectiveArchivedByDate,
  pickReactivatableArchivedObjective,
  syncObjectiveStatuses,
} from "@/lib/objective-lifecycle";
import {
  clearBrowseObjective,
  getWorkspaceMeta,
  resolveObjectiveId,
  setBrowseObjectiveId,
} from "@/lib/objective-context";

function assertObjectiveSpan(startDate: string, endDate: string) {
  if (inclusiveDayCount(startDate, endDate) < MIN_OBJECTIVE_DAYS) {
    throw new Error(
      `A study cycle must last at least ${MIN_OBJECTIVE_DAYS} days.`,
    );
  }
}

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/syllabus");
  revalidatePath("/dashboard");
  revalidatePath("/settings");
}

export async function listObjectives() {
  await syncObjectiveStatuses();
  await assertSingleActiveInvariant();
  const db = getDb();
  return db.query.objectives.findMany({
    orderBy: (o, { desc }) => [desc(o.startDate)],
  });
}

export async function getObjective(id: string) {
  const db = getDb();
  return db.query.objectives.findFirst({
    where: eq(objectives.id, id),
    with: { phases: true },
  });
}

async function assertNoOverlap(
  startDate: string,
  endDate: string,
  excludeId?: string,
) {
  const db = getDb();
  const today = toDateString(new Date());
  const all = await db.query.objectives.findMany();
  for (const o of all) {
    if (excludeId && o.id === excludeId) continue;
    if (isObjectiveArchivedByDate(o.endDate, today)) continue;
    if (datesOverlap(startDate, endDate, o.startDate, o.endDate)) {
      throw new Error(
        `Date range overlaps with live cycle "${o.name}" (${o.startDate} → ${o.endDate}).`,
      );
    }
  }
}

export async function createObjective(input: {
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
}) {
  if (input.startDate > input.endDate) {
    throw new Error("Start date must be before end date.");
  }
  assertObjectiveSpan(input.startDate, input.endDate);

  await syncObjectiveStatuses();
  const activeId = await getActiveObjectiveId();
  if (activeId) {
    throw new Error(
      "A study cycle is still live (end date has not passed). End it early or wait until after the end date before starting a new one.",
    );
  }

  const today = toDateString(new Date());
  if (input.startDate < today) {
    throw new Error("Study cycle start cannot be before today.");
  }

  await assertNoOverlap(input.startDate, input.endDate);
  const db = getDb();
  const id = newId();
  await db.insert(objectives).values({
    id,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    startDate: input.startDate,
    endDate: input.endDate,
    status: "active",
    createdAt: nowIso(),
  });
  await clearBrowseObjective();
  await assertSingleActiveInvariant();
  revalidateAll();
  return id;
}

export async function updateActiveObjective(input: {
  name?: string;
  description?: string;
  startDate: string;
  endDate: string;
}) {
  const live = await getLiveObjectiveRecord();
  if (!live) {
    throw new Error("No live study cycle to edit (end date is in the past).");
  }
  const today = toDateString(new Date());
  if (isObjectiveArchivedByDate(input.endDate, today)) {
    throw new Error(
      "End date is already in the past — the cycle would archive immediately. Pick today or a future end date.",
    );
  }
  const db = getDb();
  const current = live;
  const startLocked = current.startDate < today;

  if (startLocked) {
    if (input.startDate !== current.startDate) {
      throw new Error(
        "Study cycle start cannot be changed after the cycle has begun.",
      );
    }
  } else if (input.startDate < today) {
    throw new Error("Study cycle start cannot be before today.");
  }

  const startDate = startLocked ? current.startDate : input.startDate;
  if (startDate > input.endDate) throw new Error("Invalid date range");
  assertObjectiveSpan(startDate, input.endDate);
  await assertNoOverlap(startDate, input.endDate, current.id);

  await db
    .update(objectives)
    .set({
      name: input.name?.trim() ?? current.name,
      description: input.description ?? current.description,
      startDate,
      endDate: input.endDate,
    })
    .where(eq(objectives.id, current.id));
  await syncObjectiveStatuses();
  revalidateAll();
}

/**
 * End the live cycle early by moving end date to yesterday so today > endDate (then sync archives).
 */
/** Extend end date on the most recently archived cycle so it becomes live again. */
export async function reactivateLastArchivedObjective(input: {
  endDate: string;
  name?: string;
}) {
  await syncObjectiveStatuses();
  const live = await getLiveObjectiveRecord();
  if (live) {
    throw new Error(
      "A study cycle is already live. End it or wait until after its end date before reopening another.",
    );
  }

  const db = getDb();
  const today = toDateString(new Date());
  const all = await db.query.objectives.findMany();
  const target = pickReactivatableArchivedObjective(all, today);
  if (!target) {
    throw new Error("No archived cycle is eligible to reopen.");
  }

  if (isObjectiveArchivedByDate(input.endDate, today)) {
    throw new Error("New end date must be today or later so the cycle stays active.");
  }
  if (target.startDate > today) {
    throw new Error(
      "This cycle's start date is still in the future. Create a new cycle with valid dates instead.",
    );
  }
  if (target.startDate > input.endDate) {
    throw new Error("End date must be on or after the cycle start date.");
  }
  assertObjectiveSpan(target.startDate, input.endDate);

  await assertNoOverlap(target.startDate, input.endDate, target.id);

  await db
    .update(objectives)
    .set({
      endDate: input.endDate,
      name: input.name?.trim() ?? target.name,
    })
    .where(eq(objectives.id, target.id));

  await clearBrowseObjective();
  await syncObjectiveStatuses();
  revalidateAll();
}

export async function endActiveCycleNow() {
  const id = await getActiveObjectiveId();
  if (!id) throw new Error("No active study cycle.");
  const today = toDateString(new Date());
  const db = getDb();
  const row = await db.query.objectives.findFirst({
    where: eq(objectives.id, id),
  });
  if (!row) throw new Error("Objective not found");
  if (isObjectiveArchivedByDate(row.endDate, today)) {
    throw new Error("This cycle is already archived (end date is in the past).");
  }

  const pastEnd = addDaysString(today, -1);
  const endDate = row.endDate < pastEnd ? row.endDate : pastEnd;
  await db.update(objectives).set({ endDate }).where(eq(objectives.id, id));
  await syncObjectiveStatuses();
  await clearBrowseObjective();
  revalidateAll();
}

export async function openArchivedCycleForView(archivedId: string) {
  await setBrowseObjectiveId(archivedId);
  revalidateAll();
}

export async function returnToActiveCycle() {
  await clearBrowseObjective();
  revalidateAll();
}

/** Hard-delete an archived cycle and all related data (DB cascade). */
export async function deleteArchivedObjective(id: string) {
  const today = toDateString(new Date());
  const db = getDb();
  const row = await db.query.objectives.findFirst({
    where: eq(objectives.id, id),
  });
  if (!row) throw new Error("Study cycle not found.");
  if (!isObjectiveArchivedByDate(row.endDate, today)) {
    throw new Error(
      "Only archived cycles can be deleted. Use “End cycle now” on a live cycle first.",
    );
  }

  const { viewId } = await getWorkspaceMeta();
  if (viewId === id) {
    await clearBrowseObjective();
  }

  await db.delete(objectives).where(eq(objectives.id, id));
  await syncObjectiveStatuses();
  revalidateAll();
}

export async function getCurrentObjectiveId() {
  return resolveObjectiveId();
}

export async function getWorkspaceState() {
  return getWorkspaceMeta();
}
