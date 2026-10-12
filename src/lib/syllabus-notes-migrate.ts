import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { studyNotes, subtopics, topics } from "@/db/schema";

/**
 * Copy legacy per-day study_notes into global topic/subtopic notes (once).
 * Safe during RSC render — no revalidatePath.
 */
export async function migrateStudyNotesToGlobal(objectiveId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db.query.studyNotes.findMany({
    where: eq(studyNotes.objectiveId, objectiveId),
    orderBy: (n, { desc }) => [desc(n.updatedAt)],
  });
  if (rows.length === 0) return false;

  let changed = false;
  const topicDone = new Set<string>();
  const subDone = new Set<string>();

  for (const row of rows) {
    const body = row.body.trim();
    if (!body) continue;
    if (row.subtopicId) {
      if (subDone.has(row.subtopicId)) continue;
      const sub = await db.query.subtopics.findFirst({
        where: eq(subtopics.id, row.subtopicId),
      });
      if (!sub || (sub.notes?.trim() ?? "").length > 0) {
        subDone.add(row.subtopicId);
        continue;
      }
      await db
        .update(subtopics)
        .set({ notes: body })
        .where(eq(subtopics.id, row.subtopicId));
      subDone.add(row.subtopicId);
      changed = true;
    } else {
      if (topicDone.has(row.topicId)) continue;
      const topic = await db.query.topics.findFirst({
        where: eq(topics.id, row.topicId),
      });
      if (!topic || (topic.notes?.trim() ?? "").length > 0) {
        topicDone.add(row.topicId);
        continue;
      }
      await db.update(topics).set({ notes: body }).where(eq(topics.id, row.topicId));
      topicDone.add(row.topicId);
      changed = true;
    }
  }

  return changed;
}
