import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { completionEvents } from "@/db/schema";
import { roundWeightTenth } from "@/lib/weight";

/** Leaf topic logs store weight on the topic-level completion event. */
export async function syncLeafTopicCompletionSnapshots(
  topicId: string,
  weight: number,
) {
  const db = getDb();
  const snapshot = roundWeightTenth(weight);
  await db
    .update(completionEvents)
    .set({ weightSnapshot: snapshot })
    .where(
      and(
        eq(completionEvents.topicId, topicId),
        isNull(completionEvents.subtopicId),
      ),
    );
}

/** Subtopic logs store weight on each subtopic's completion event. */
export async function syncSubtopicCompletionSnapshots(
  subtopicId: string,
  weight: number,
) {
  const db = getDb();
  const snapshot = roundWeightTenth(weight);
  await db
    .update(completionEvents)
    .set({ weightSnapshot: snapshot })
    .where(eq(completionEvents.subtopicId, subtopicId));
}
