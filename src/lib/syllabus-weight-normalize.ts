import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subjects, subtopics, topics } from "@/db/schema";
import { roundWeightTenth, weightsEqual } from "@/lib/weight";

/**
 * Snap subtopic + topic weights to one decimal in the DB.
 * Safe to call during RSC render (no cache revalidation).
 */
export async function normalizeTopicWeightsForObjective(
  objectiveId: string,
): Promise<boolean> {
  const db = getDb();
  const subjectRows = await db.query.subjects.findMany({
    where: eq(subjects.objectiveId, objectiveId),
    with: { topics: { with: { subtopics: true } } },
  });
  let changed = false;

  for (const subject of subjectRows) {
    for (const topic of subject.topics) {
      if (topic.subtopics.length === 0) {
        const w = roundWeightTenth(topic.weight);
        if (!weightsEqual(w, topic.weight)) {
          await db.update(topics).set({ weight: w }).where(eq(topics.id, topic.id));
          changed = true;
        }
        continue;
      }

      for (const sub of topic.subtopics) {
        const w = roundWeightTenth(sub.weight);
        if (!weightsEqual(w, sub.weight)) {
          await db
            .update(subtopics)
            .set({ weight: w })
            .where(eq(subtopics.id, sub.id));
          changed = true;
        }
      }

      const sum = roundWeightTenth(
        topic.subtopics.reduce((acc, s) => acc + roundWeightTenth(s.weight), 0),
      );
      if (!weightsEqual(sum, topic.weight)) {
        await db.update(topics).set({ weight: sum }).where(eq(topics.id, topic.id));
        changed = true;
      }
    }
  }

  return changed;
}
