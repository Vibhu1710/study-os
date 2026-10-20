import { eq } from "drizzle-orm";
import { getDb, nowIso } from "@/db";
import { appSettings, objectives } from "@/db/schema";
import { isObjectiveArchivedByDate } from "@/lib/objective-lifecycle";
import type { RhythmSandglassConfig } from "@/lib/rhythm/effective-minutes";
import { toDateString } from "@/lib/dates";

const SETTINGS_ID = "default";

export async function getGlobalRhythmConfig(): Promise<RhythmSandglassConfig> {
  const db = getDb();
  let row = await db.query.appSettings.findFirst({
    where: eq(appSettings.id, SETTINGS_ID),
  });
  if (!row) {
    const ts = nowIso();
    await db.insert(appSettings).values({
      id: SETTINGS_ID,
      rhythmOddCycleMinutes: 27,
      rhythmEvenCycleMinutes: 22,
      updatedAt: ts,
    });
    row = await db.query.appSettings.findFirst({
      where: eq(appSettings.id, SETTINGS_ID),
    });
  }
  return {
    oddMinutes: row!.rhythmOddCycleMinutes,
    evenMinutes: row!.rhythmEvenCycleMinutes,
  };
}

export async function updateGlobalRhythmConfig(
  oddMinutes: number,
  evenMinutes: number,
) {
  if (oddMinutes <= 0 || evenMinutes <= 0 || oddMinutes > 120 || evenMinutes > 120) {
    throw new Error("Sandglass minutes must be between 1 and 120.");
  }
  const db = getDb();
  const existing = await db.query.appSettings.findFirst({
    where: eq(appSettings.id, SETTINGS_ID),
  });
  const ts = nowIso();
  if (existing) {
    await db
      .update(appSettings)
      .set({
        rhythmOddCycleMinutes: oddMinutes,
        rhythmEvenCycleMinutes: evenMinutes,
        updatedAt: ts,
      })
      .where(eq(appSettings.id, SETTINGS_ID));
  } else {
    await db.insert(appSettings).values({
      id: SETTINGS_ID,
      rhythmOddCycleMinutes: oddMinutes,
      rhythmEvenCycleMinutes: evenMinutes,
      updatedAt: ts,
    });
  }
}

/** Live global for active cycle; frozen pair for archived objectives. */
export async function resolveRhythmConfigForObjective(
  objectiveId: string,
): Promise<RhythmSandglassConfig> {
  const db = getDb();
  const objective = await db.query.objectives.findFirst({
    where: eq(objectives.id, objectiveId),
  });
  if (!objective) throw new Error("Objective not found");
  const today = toDateString(new Date());
  const archived = isObjectiveArchivedByDate(objective.endDate, today);
  if (archived) {
    if (
      objective.rhythmOddMinutesFrozen == null ||
      objective.rhythmEvenMinutesFrozen == null
    ) {
      await freezeRhythmConfigOnObjective(objectiveId);
      const refreshed = await db.query.objectives.findFirst({
        where: eq(objectives.id, objectiveId),
      });
      if (refreshed?.rhythmOddMinutesFrozen != null) {
        return {
          oddMinutes: refreshed.rhythmOddMinutesFrozen,
          evenMinutes: refreshed.rhythmEvenMinutesFrozen!,
        };
      }
    } else {
      return {
        oddMinutes: objective.rhythmOddMinutesFrozen,
        evenMinutes: objective.rhythmEvenMinutesFrozen,
      };
    }
  }
  return getGlobalRhythmConfig();
}

export async function freezeRhythmConfigOnObjective(objectiveId: string) {
  const db = getDb();
  const cfg = await getGlobalRhythmConfig();
  await db
    .update(objectives)
    .set({
      rhythmOddMinutesFrozen: cfg.oddMinutes,
      rhythmEvenMinutesFrozen: cfg.evenMinutes,
    })
    .where(eq(objectives.id, objectiveId));
}
