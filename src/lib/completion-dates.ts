import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { completionEvents } from "@/db/schema";

export type CompletionDates = {
  bySubtopicId: Record<string, string>;
  byTopicId: Record<string, string>;
};

export async function fetchCompletionDates(objectiveId: string): Promise<CompletionDates> {
  const db = getDb();
  const events = await db.query.completionEvents.findMany({
    where: eq(completionEvents.objectiveId, objectiveId),
  });
  const bySubtopicId: Record<string, string> = {};
  const byTopicId: Record<string, string> = {};
  for (const e of events) {
    if (e.subtopicId) bySubtopicId[e.subtopicId] = e.date;
    else byTopicId[e.topicId] = e.date;
  }
  return { bySubtopicId, byTopicId };
}
