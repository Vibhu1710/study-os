"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, newId } from "@/db";
import { objectives, subjects } from "@/db/schema";
import { assertWritable } from "@/lib/objective-context";
import {
  assertSubjectColorAllowed,
  conflictsWithAnySubjectColor,
  normalizeHexColor,
  pickSubjectColor,
} from "@/lib/subject-colors";

function revalidate() {
  revalidatePath("/");
  revalidatePath("/syllabus");
  revalidatePath("/dashboard");
}

async function assertObjective(objectiveId: string) {
  const db = getDb();
  const o = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  if (!o) throw new Error("Objective not found");
  assertWritable(o);
  return o;
}

export async function createSubject(
  objectiveId: string,
  input: { name: string; color?: string },
) {
  await assertObjective(objectiveId);
  const db = getDb();
  const siblings = await db.query.subjects.findMany({
    where: eq(subjects.objectiveId, objectiveId),
  });
  const sortOrder = siblings.length;
  const siblingColors = siblings.map((s) => s.color);
  let color: string;
  if (input.color) {
    assertSubjectColorAllowed(input.color, siblingColors);
    color = input.color;
  } else {
    color = pickSubjectColor(siblingColors);
  }
  const id = newId();
  await db.insert(subjects).values({
    id,
    objectiveId,
    name: input.name,
    color,
    sortOrder,
  });
  revalidate();
  return id;
}

export async function updateSubject(
  id: string,
  input: Partial<{ name: string; color: string; sortOrder: number }>,
) {
  const db = getDb();
  const row = await db.query.subjects.findFirst({
    where: eq(subjects.id, id),
    with: { objective: true },
  });
  if (!row) throw new Error("Subject not found");
  assertWritable(row.objective);
  if (input.color) {
    const siblings = await db.query.subjects.findMany({
      where: eq(subjects.objectiveId, row.objectiveId),
    });
    const otherColors = siblings.filter((s) => s.id !== id).map((s) => s.color);
    assertSubjectColorAllowed(input.color, otherColors);
  }
  await db.update(subjects).set(input).where(eq(subjects.id, id));
  revalidate();
}

export async function deleteSubject(id: string) {
  const db = getDb();
  const row = await db.query.subjects.findFirst({
    where: eq(subjects.id, id),
    with: { objective: true },
  });
  if (!row) return;
  assertWritable(row.objective);
  await db.delete(subjects).where(eq(subjects.id, id));
  revalidate();
}

/**
 * Enforce reserved calendar blue + pairwise distinct subject colors
 * (fixes legacy duplicates e.g. Interview & Psych sharing green).
 */
export async function ensureSubjectColorsDistinct(objectiveId: string) {
  const db = getDb();
  const subs = await db.query.subjects.findMany({
    where: eq(subjects.objectiveId, objectiveId),
    orderBy: (s, { asc }) => [asc(s.sortOrder)],
  });
  if (subs.length === 0) return;

  const assigned: string[] = [];
  let changed = false;

  for (const sub of subs) {
    if (!conflictsWithAnySubjectColor(sub.color, assigned)) {
      assigned.push(sub.color);
      continue;
    }
    const next = pickSubjectColor(assigned);
    assigned.push(next);
    if (normalizeHexColor(sub.color) !== normalizeHexColor(next)) {
      await db.update(subjects).set({ color: next }).where(eq(subjects.id, sub.id));
      changed = true;
    }
  }

  if (changed) revalidate();
}

/** @deprecated Use ensureSubjectColorsDistinct */
export async function ensureDistinctSubjectColors(objectiveId: string) {
  return ensureSubjectColorsDistinct(objectiveId);
}

/** @deprecated Use ensureSubjectColorsDistinct */
export async function ensureSubjectsAvoidReservedCalendarColor(objectiveId: string) {
  return ensureSubjectColorsDistinct(objectiveId);
}

export async function listSubjects(objectiveId: string) {
  const db = getDb();
  return db.query.subjects.findMany({
    where: eq(subjects.objectiveId, objectiveId),
    orderBy: (s, { asc }) => [asc(s.sortOrder)],
    with: {
      topics: {
        orderBy: (t, { asc }) => [asc(t.sortOrder)],
        with: {
          subtopics: {
            orderBy: (st, { asc }) => [asc(st.sortOrder)],
          },
        },
      },
    },
  });
}
