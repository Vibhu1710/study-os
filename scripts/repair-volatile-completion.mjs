import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = path.join(root, "data", "study-os.db");
const db = new Database(dbPath);

function todayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const today = todayLocal();
console.log("Repair volatile completions for date >=", today);

const objectives = db.prepare("SELECT id FROM objectives").all();
for (const { id: objectiveId } of objectives) {
  const del = db
    .prepare("DELETE FROM completion_events WHERE objective_id = ? AND date = ?")
    .run(objectiveId, today);
  console.log(`  objective ${objectiveId}: removed ${del.changes} today event(s)`);

  db.prepare(
    `UPDATE subtopics SET completed_at = NULL
     WHERE topic_id IN (SELECT id FROM topics WHERE subject_id IN (SELECT id FROM subjects WHERE objective_id = ?))`,
  ).run(objectiveId);

  db.prepare(
    `UPDATE topics SET completed_at = NULL
     WHERE subject_id IN (SELECT id FROM subjects WHERE objective_id = ?)`,
  ).run(objectiveId);

  const pastEvents = db
    .prepare(
      "SELECT * FROM completion_events WHERE objective_id = ? AND date < ? ORDER BY date",
    )
    .all(objectiveId, today);

  const ts = new Date().toISOString();
  for (const ev of pastEvents) {
    if (ev.subtopic_id) {
      db.prepare("UPDATE subtopics SET completed_at = ? WHERE id = ?").run(
        ts,
        ev.subtopic_id,
      );
    } else {
      db.prepare("UPDATE topics SET completed_at = ? WHERE id = ?").run(ts, ev.topic_id);
    }
  }
}

console.log("Done.");
db.close();
