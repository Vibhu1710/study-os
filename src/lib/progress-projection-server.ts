import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { completionEvents } from "@/db/schema";
import type { VolatileTodayKeys } from "@/lib/progress-projection";
import { todayString } from "@/lib/study-day";

export async function fetchVolatileTodayKeys(
  objectiveId: string,
): Promise<VolatileTodayKeys> {
  const today = todayString();
  const db = getDb();
  const events = await db.query.completionEvents.findMany({
    where: and(
      eq(completionEvents.objectiveId, objectiveId),
      eq(completionEvents.date, today),
    ),
  });
  const subtopicIds = new Set<string>();
  const topicIds = new Set<string>();
  for (const e of events) {
    if (e.subtopicId) subtopicIds.add(e.subtopicId);
    else topicIds.add(e.topicId);
  }
  return { subtopicIds, topicIds };
}
