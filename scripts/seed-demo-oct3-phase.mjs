/**
 * Demo data: single-day “previous phase” work on 2026-10-03 (outside current Sprint).
 *
 * - Interview: leaf topic fully completed that day.
 * - Psych: topic with two subtopics; only one subtopic completed (carries into current phase).
 *
 * Safe to re-run (fixed demo ids).
 */
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import path from "path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = path.join(root, "data", "study-os.db");
const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const DEMO_DAY = "2026-10-03";
const DEMO = {
  interviewTopicId: "demo-0001-interview-oct3-leaf",
  psychTopicId: "demo-0002-psych-oct3-parent",
  psychSubA: "demo-0003-psych-oct3-sub-a",
  psychSubB: "demo-0004-psych-oct3-sub-b",
};

const objective = db
  .prepare(
    `SELECT id, current_phase_id, start_date FROM objectives ORDER BY created_at LIMIT 1`,
  )
  .get();
if (!objective) {
  console.error("No objective found — create one in the app first.");
  process.exit(1);
}

const objectiveId = objective.id;
const phaseId = objective.current_phase_id;
if (!phaseId) {
  console.error("No current phase — set a Sprint phase in the app first.");
  process.exit(1);
}

if (objective.start_date > DEMO_DAY) {
  db.prepare(`UPDATE objectives SET start_date = ? WHERE id = ?`).run(
    DEMO_DAY,
    objectiveId,
  );
  console.log(`Extended objective start to ${DEMO_DAY}`);
}

const interview = db
  .prepare(`SELECT id FROM subjects WHERE objective_id = ? AND name = 'Interview'`)
  .get(objectiveId);
const psych = db
  .prepare(`SELECT id FROM subjects WHERE objective_id = ? AND name = 'Psych'`)
  .get(objectiveId);

if (!interview || !psych) {
  console.error("Need Interview and Psych subjects on the objective.");
  process.exit(1);
}

function maxTopicSort(subjectId) {
  const row = db
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM topics WHERE subject_id = ?`)
    .get(subjectId);
  return (row?.m ?? -1) + 1;
}

const insertTopic = db.prepare(
  `INSERT OR IGNORE INTO topics (id, subject_id, title, weight, sort_order, completed_at, notes)
   VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
);
const insertSub = db.prepare(
  `INSERT OR IGNORE INTO subtopics (id, topic_id, title, weight, sort_order, completed_at)
   VALUES (?, ?, ?, ?, ?, NULL)`,
);

insertTopic.run(
  DEMO.interviewTopicId,
  interview.id,
  "Dummy interview briefing",
  2,
  maxTopicSort(interview.id),
);
insertTopic.run(
  DEMO.psychTopicId,
  psych.id,
  "Dummy psych pair drill",
  2,
  maxTopicSort(psych.id),
);
insertSub.run(DEMO.psychSubA, DEMO.psychTopicId, "Dummy psych part A", 1, 0);
insertSub.run(DEMO.psychSubB, DEMO.psychTopicId, "Dummy psych part B", 1, 1);

const demoTopicIds = [DEMO.interviewTopicId, DEMO.psychTopicId];
const demoSubIds = [DEMO.psychSubA, DEMO.psychSubB];

db.prepare(
  `DELETE FROM completion_events
   WHERE objective_id = ? AND date = ? AND topic_id IN (${demoTopicIds.map(() => "?").join(",")})`,
).run(objectiveId, DEMO_DAY, ...demoTopicIds);

const ts = new Date(`${DEMO_DAY}T20:00:00.000Z`).toISOString();

const insertEvent = db.prepare(
  `INSERT INTO completion_events (id, objective_id, subject_id, topic_id, subtopic_id, date, weight_snapshot)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);

insertEvent.run(
  randomUUID(),
  objectiveId,
  interview.id,
  DEMO.interviewTopicId,
  null,
  DEMO_DAY,
  2,
);
insertEvent.run(
  randomUUID(),
  objectiveId,
  psych.id,
  DEMO.psychTopicId,
  DEMO.psychSubA,
  DEMO_DAY,
  1,
);

db.prepare(`UPDATE topics SET completed_at = NULL WHERE id IN (?, ?)`).run(
  DEMO.interviewTopicId,
  DEMO.psychTopicId,
);
db.prepare(`UPDATE subtopics SET completed_at = NULL WHERE id IN (?, ?)`).run(
  DEMO.psychSubA,
  DEMO.psychSubB,
);

db.prepare(`UPDATE topics SET completed_at = ? WHERE id = ?`).run(
  ts,
  DEMO.interviewTopicId,
);
db.prepare(`UPDATE subtopics SET completed_at = ? WHERE id = ?`).run(ts, DEMO.psychSubA);

db.prepare(
  `INSERT OR IGNORE INTO phase_topics (phase_id, topic_id) VALUES (?, ?)`,
).run(phaseId, DEMO.psychTopicId);

console.log("Demo Oct 3 seed applied:");
console.log(`  ${DEMO_DAY} — Interview leaf "${DEMO.interviewTopicId}" completed (2 wt)`);
console.log(
  `  ${DEMO_DAY} — Psych partial: subtopic A done, B open → in current phase`,
);
console.log(`  Current phase id: ${phaseId}`);
console.log(
  "Open calendar: Oct 3 should show dual-subject heat (dimmed, outside Sprint).",
);

db.close();
