import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import * as schema from "./schema";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "study-os.db");

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

let sqlite: Database.Database | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!dbInstance) {
    ensureDb();
    sqlite = new Database(DB_PATH);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    runMigrations(sqlite);
    dbInstance = drizzle(sqlite, { schema });
  }
  return dbInstance;
}

function runMigrations(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS objectives (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned',
      current_phase_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      objective_id TEXT NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#3fb950',
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS subjects_objective_idx ON subjects(objective_id);

    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      notes TEXT
    );
    CREATE INDEX IF NOT EXISTS topics_subject_idx ON topics(subject_id);

    CREATE TABLE IF NOT EXISTS subtopics (
      id TEXT PRIMARY KEY,
      topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      weight REAL NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      notes TEXT
    );
    CREATE INDEX IF NOT EXISTS subtopics_topic_idx ON subtopics(topic_id);

    CREATE TABLE IF NOT EXISTS backlog_items (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS backlog_subject_idx ON backlog_items(subject_id);

    CREATE TABLE IF NOT EXISTS phases (
      id TEXT PRIMARY KEY,
      objective_id TEXT NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS phases_objective_idx ON phases(objective_id);

    CREATE TABLE IF NOT EXISTS phase_topics (
      phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
      topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      UNIQUE(phase_id, topic_id)
    );
    CREATE INDEX IF NOT EXISTS phase_topics_phase_idx ON phase_topics(phase_id);

    CREATE TABLE IF NOT EXISTS day_plans (
      id TEXT PRIMARY KEY,
      objective_id TEXT NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      UNIQUE(objective_id, date)
    );
    CREATE INDEX IF NOT EXISTS day_plans_objective_idx ON day_plans(objective_id);

    CREATE TABLE IF NOT EXISTS day_plan_items (
      id TEXT PRIMARY KEY,
      day_plan_id TEXT NOT NULL REFERENCES day_plans(id) ON DELETE CASCADE,
      topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      subtopic_id TEXT REFERENCES subtopics(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'planned'
    );
    CREATE INDEX IF NOT EXISTS day_plan_items_plan_idx ON day_plan_items(day_plan_id);

    CREATE TABLE IF NOT EXISTS completion_events (
      id TEXT PRIMARY KEY,
      objective_id TEXT NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      subtopic_id TEXT REFERENCES subtopics(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      weight_snapshot REAL NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS completion_subtopic_unique ON completion_events(subtopic_id);
    CREATE INDEX IF NOT EXISTS completion_objective_date_idx ON completion_events(objective_id, date);

    CREATE TABLE IF NOT EXISTS study_notes (
      id TEXT PRIMARY KEY,
      objective_id TEXT NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      subtopic_id TEXT REFERENCES subtopics(id) ON DELETE CASCADE,
      body TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS study_notes_unique ON study_notes(objective_id, date, topic_id, subtopic_id);
    CREATE INDEX IF NOT EXISTS study_notes_date_idx ON study_notes(objective_id, date);

    CREATE TABLE IF NOT EXISTS day_notes (
      id TEXT PRIMARY KEY,
      objective_id TEXT NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS day_notes_objective_date_unique ON day_notes(objective_id, date);
    CREATE INDEX IF NOT EXISTS day_notes_date_idx ON day_notes(objective_id, date);
  `);
  try {
    database.exec(`ALTER TABLE topics ADD COLUMN notes TEXT`);
  } catch {
    /* column exists */
  }
  try {
    database.exec(`ALTER TABLE objectives ADD COLUMN pending_phase_topic_ids TEXT`);
  } catch {
    /* column exists */
  }
  try {
    database.exec(`ALTER TABLE subtopics ADD COLUMN notes TEXT`);
  } catch {
    /* column exists */
  }
  try {
    database.exec(
      `ALTER TABLE objectives ADD COLUMN rhythm_odd_minutes_frozen REAL`,
    );
  } catch {
    /* exists */
  }
  try {
    database.exec(
      `ALTER TABLE objectives ADD COLUMN rhythm_even_minutes_frozen REAL`,
    );
  } catch {
    /* exists */
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id TEXT PRIMARY KEY,
      rhythm_odd_cycle_minutes REAL NOT NULL DEFAULT 27,
      rhythm_even_cycle_minutes REAL NOT NULL DEFAULT 22,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rhythm_sessions (
      id TEXT PRIMARY KEY,
      objective_id TEXT NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      starts_with_odd_cycle INTEGER NOT NULL,
      full_cycle_count INTEGER NOT NULL DEFAULT 0,
      start_partial_tenths INTEGER NOT NULL DEFAULT 0,
      end_partial_tenths INTEGER NOT NULL DEFAULT 0,
      continued_from_previous_day INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS rhythm_sessions_objective_date ON rhythm_sessions(objective_id, date);
    CREATE INDEX IF NOT EXISTS rhythm_sessions_objective_idx ON rhythm_sessions(objective_id);
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS rhythm_day_notes (
      id TEXT PRIMARY KEY,
      objective_id TEXT NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS rhythm_day_notes_objective_date_unique ON rhythm_day_notes(objective_id, date);
    CREATE INDEX IF NOT EXISTS rhythm_day_notes_date_idx ON rhythm_day_notes(objective_id, date);
  `);
  for (const sql of [
    `ALTER TABLE rhythm_sessions ADD COLUMN entries_json TEXT`,
    `ALTER TABLE rhythm_sessions ADD COLUMN start_time_confirmed INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE rhythm_sessions ADD COLUMN end_time_confirmed INTEGER NOT NULL DEFAULT 0`,
  ]) {
    try {
      database.exec(sql);
    } catch {
      /* column exists */
    }
  }
  const settingsCount = database
    .prepare(`SELECT COUNT(*) as c FROM app_settings WHERE id = 'default'`)
    .get() as { c: number };
  if (settingsCount.c === 0) {
    database
      .prepare(
        `INSERT INTO app_settings (id, rhythm_odd_cycle_minutes, rhythm_even_cycle_minutes, updated_at) VALUES ('default', 27, 22, ?)`,
      )
      .run(new Date().toISOString());
  }
}

export function newId() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}
