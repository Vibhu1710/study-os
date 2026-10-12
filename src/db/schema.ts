import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const objectives = sqliteTable("objectives", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status", { enum: ["planned", "active", "archived"] })
    .notNull()
    .default("planned"),
  currentPhaseId: text("current_phase_id"),
  /** JSON array of topic ids to pre-fill the next phase after the current one ends. */
  pendingPhaseTopicIds: text("pending_phase_topic_ids"),
  createdAt: text("created_at").notNull(),
});

export const subjects = sqliteTable(
  "subjects",
  {
    id: text("id").primaryKey(),
    objectiveId: text("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#3fb950"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("subjects_objective_idx").on(t.objectiveId)],
);

export const topics = sqliteTable(
  "topics",
  {
    id: text("id").primaryKey(),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    weight: real("weight").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    completedAt: text("completed_at"),
    notes: text("notes"),
  },
  (t) => [index("topics_subject_idx").on(t.subjectId)],
);

export const subtopics = sqliteTable(
  "subtopics",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    weight: real("weight").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    completedAt: text("completed_at"),
    notes: text("notes"),
  },
  (t) => [index("subtopics_topic_idx").on(t.topicId)],
);

export const backlogItems = sqliteTable(
  "backlog_items",
  {
    id: text("id").primaryKey(),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("backlog_subject_idx").on(t.subjectId)],
);

export const phases = sqliteTable(
  "phases",
  {
    id: text("id").primaryKey(),
    objectiveId: text("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("phases_objective_idx").on(t.objectiveId)],
);

export const phaseTopics = sqliteTable(
  "phase_topics",
  {
    phaseId: text("phase_id")
      .notNull()
      .references(() => phases.id, { onDelete: "cascade" }),
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("phase_topics_unique").on(t.phaseId, t.topicId),
    index("phase_topics_phase_idx").on(t.phaseId),
  ],
);

export const dayPlans = sqliteTable(
  "day_plans",
  {
    id: text("id").primaryKey(),
    objectiveId: text("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
  },
  (t) => [
    uniqueIndex("day_plans_objective_date").on(t.objectiveId, t.date),
    index("day_plans_objective_idx").on(t.objectiveId),
  ],
);

export const dayPlanItems = sqliteTable(
  "day_plan_items",
  {
    id: text("id").primaryKey(),
    dayPlanId: text("day_plan_id")
      .notNull()
      .references(() => dayPlans.id, { onDelete: "cascade" }),
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    subtopicId: text("subtopic_id").references(() => subtopics.id, {
      onDelete: "cascade",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status", { enum: ["planned", "done", "removed"] })
      .notNull()
      .default("planned"),
  },
  (t) => [
    index("day_plan_items_plan_idx").on(t.dayPlanId),
    uniqueIndex("day_plan_items_unique").on(t.dayPlanId, t.topicId, t.subtopicId),
  ],
);

export const completionEvents = sqliteTable(
  "completion_events",
  {
    id: text("id").primaryKey(),
    objectiveId: text("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    subtopicId: text("subtopic_id").references(() => subtopics.id, {
      onDelete: "cascade",
    }),
    date: text("date").notNull(),
    weightSnapshot: real("weight_snapshot").notNull(),
  },
  (t) => [
    index("completion_objective_date_idx").on(t.objectiveId, t.date),
    uniqueIndex("completion_subtopic_unique").on(t.subtopicId),
  ],
);

/** Free-form journal for a calendar day (not tied to any topic). */
export const dayNotes = sqliteTable(
  "day_notes",
  {
    id: text("id").primaryKey(),
    objectiveId: text("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    body: text("body").notNull().default(""),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("day_notes_objective_date_unique").on(t.objectiveId, t.date),
    index("day_notes_date_idx").on(t.objectiveId, t.date),
  ],
);

export const studyNotes = sqliteTable(
  "study_notes",
  {
    id: text("id").primaryKey(),
    objectiveId: text("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    subtopicId: text("subtopic_id").references(() => subtopics.id, {
      onDelete: "cascade",
    }),
    body: text("body").notNull().default(""),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("study_notes_unique").on(
      t.objectiveId,
      t.date,
      t.topicId,
      t.subtopicId,
    ),
    index("study_notes_date_idx").on(t.objectiveId, t.date),
  ],
);

export const objectivesRelations = relations(objectives, ({ many }) => ({
  subjects: many(subjects),
  phases: many(phases),
  dayPlans: many(dayPlans),
}));

export const subjectsRelations = relations(subjects, ({ one, many }) => ({
  objective: one(objectives, {
    fields: [subjects.objectiveId],
    references: [objectives.id],
  }),
  topics: many(topics),
  backlogItems: many(backlogItems),
}));

export const topicsRelations = relations(topics, ({ one, many }) => ({
  subject: one(subjects, {
    fields: [topics.subjectId],
    references: [subjects.id],
  }),
  subtopics: many(subtopics),
}));

export const subtopicsRelations = relations(subtopics, ({ one }) => ({
  topic: one(topics, {
    fields: [subtopics.topicId],
    references: [topics.id],
  }),
}));

export const phasesRelations = relations(phases, ({ one, many }) => ({
  objective: one(objectives, {
    fields: [phases.objectiveId],
    references: [objectives.id],
  }),
  phaseTopics: many(phaseTopics),
}));

export const dayPlansRelations = relations(dayPlans, ({ one, many }) => ({
  objective: one(objectives, {
    fields: [dayPlans.objectiveId],
    references: [objectives.id],
  }),
  items: many(dayPlanItems),
}));

export const dayPlanItemsRelations = relations(dayPlanItems, ({ one }) => ({
  dayPlan: one(dayPlans, {
    fields: [dayPlanItems.dayPlanId],
    references: [dayPlans.id],
  }),
  topic: one(topics, {
    fields: [dayPlanItems.topicId],
    references: [topics.id],
  }),
  subtopic: one(subtopics, {
    fields: [dayPlanItems.subtopicId],
    references: [subtopics.id],
  }),
}));

export const completionEventsRelations = relations(completionEvents, ({ one }) => ({
  subject: one(subjects, {
    fields: [completionEvents.subjectId],
    references: [subjects.id],
  }),
  topic: one(topics, {
    fields: [completionEvents.topicId],
    references: [topics.id],
  }),
  subtopic: one(subtopics, {
    fields: [completionEvents.subtopicId],
    references: [subtopics.id],
  }),
}));

export const studyNotesRelations = relations(studyNotes, ({ one }) => ({
  topic: one(topics, {
    fields: [studyNotes.topicId],
    references: [topics.id],
  }),
  subtopic: one(subtopics, {
    fields: [studyNotes.subtopicId],
    references: [subtopics.id],
  }),
}));

export const backlogItemsRelations = relations(backlogItems, ({ one }) => ({
  subject: one(subjects, {
    fields: [backlogItems.subjectId],
    references: [subjects.id],
  }),
}));

export const phaseTopicsRelations = relations(phaseTopics, ({ one }) => ({
  phase: one(phases, {
    fields: [phaseTopics.phaseId],
    references: [phases.id],
  }),
  topic: one(topics, {
    fields: [phaseTopics.topicId],
    references: [topics.id],
  }),
}));
