"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  createTopicWithSubtopics,
  createSubtopic,
  deleteAllSubtopicsFromTopic,
  deleteSubtopic,
  reorderSubtopics,
  splitTopicIntoSubtopics,
  setTopicWeightFromSubtopics,
  updateSubtopic,
  updateTopic,
} from "@/lib/actions/topics";
import {
  DraftSubtopicsEditor,
  DraftSubtopic,
  PersistedSubtopicsEditor,
  SubtopicListItem,
  validateSubtopicListItems,
} from "@/components/syllabus/SubtopicsManager";
import { TrashIcon, TRASH_ICON_CLASS } from "@/components/ui/TrashIcon";
import { volatileKeysFromCompletionDates } from "@/lib/progress-projection";
import {
  parsePositiveWeight,
  sanitizeWeightInput,
} from "@/lib/syllabus-weight-input";
import { formatWeightDisplay, roundWeightTenth } from "@/lib/weight";

export type SyllabusSubtopic = {
  id: string;
  title: string;
  weight: number;
  completedAt: string | null;
  notes?: string | null;
};

export type SyllabusTopic = {
  id: string;
  subjectId: string;
  title: string;
  weight: number;
  sortOrder: number;
  completedAt: string | null;
  notes?: string | null;
  subtopics: SyllabusSubtopic[];
};

export type SyllabusSubjectBucket = {
  id: string;
  name: string;
  color: string;
  topics: SyllabusTopic[];
  backlogItems?: { id: string; title: string; notes: string | null }[];
};


export function TopicEditModal({
  open,
  subjects,
  subjectId,
  edit,
  readOnly,
  volatileToday,
  onClose,
  onRefresh,
  onRequestDelete,
  onSaved,
}: {
  open: boolean;
  subjects: SyllabusSubjectBucket[];
  subjectId?: string;
  edit?: SyllabusTopic;
  readOnly: boolean;
  volatileToday: ReturnType<typeof volatileKeysFromCompletionDates>;
  onClose: () => void;
  onRefresh: () => void;
  onRequestDelete: (topic: SyllabusTopic) => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(edit);
  const [draftSubtopics, setDraftSubtopics] = useState<DraftSubtopic[]>([]);
  const [editedSubtopics, setEditedSubtopics] = useState<SubtopicListItem[]>(
    [],
  );
  const hasPersistedSubtopics = Boolean(edit?.subtopics.length);
  const draftSubtopicSum = useMemo(
    () =>
      roundWeightTenth(draftSubtopics.reduce((s, d) => s + d.weight, 0)),
    [draftSubtopics],
  );
  const persistedSubtopicSum = useMemo(
    () =>
      roundWeightTenth(editedSubtopics.reduce((s, d) => s + d.weight, 0)),
    [editedSubtopics],
  );
  const editLeaf =
    isEdit && edit && edit.subtopics.length === 0 && !edit.completedAt;
  const topicWeightFromSubtopics =
    draftSubtopics.length >= 2 && (!isEdit || editLeaf);
  const [subject, setSubject] = useState(subjectId ?? subjects[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [weight, setWeight] = useState("");
  const [topicNotes, setTopicNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (edit) {
      setSubject(edit.subjectId);
      setTitle(edit.title);
      setWeight(String(edit.weight));
      setTopicNotes(edit.notes ?? "");
      setDraftSubtopics([]);
      setEditedSubtopics(
        edit.subtopics.map((s) => ({
          id: s.id,
          title: s.title,
          weight: s.weight,
          completedAt: s.completedAt,
          notes: s.notes ?? null,
          isNew: false,
        })),
      );
    } else {
      setSubject(subjectId ?? subjects[0]?.id ?? "");
      setTitle("");
      setWeight("");
      setTopicNotes("");
      setDraftSubtopics([]);
      setEditedSubtopics([]);
    }
    setError(null);
  }, [open, edit, subjectId, subjects]);

  useEffect(() => {
    if (draftSubtopics.length !== 1 && editedSubtopics.length !== 1) {
      setError(null);
    }
  }, [draftSubtopics.length, editedSubtopics.length]);

  const collapsedSubtopicsToLeaf =
    Boolean(isEdit && edit && edit.subtopics.length > 0 && editedSubtopics.length === 0);

  useEffect(() => {
    if (!open || !edit || edit.subtopics.length === 0) return;
    if (editedSubtopics.length === 0) {
      setWeight(String(edit.weight));
    }
  }, [open, edit, editedSubtopics.length]);

  const editingPersistedSubtopicSplit =
    Boolean(isEdit && hasPersistedSubtopics && editedSubtopics.length >= 2);

  const topicWeightFieldValue = topicWeightFromSubtopics
    ? formatWeightDisplay(draftSubtopicSum)
    : editingPersistedSubtopicSplit
      ? formatWeightDisplay(
          readOnly ? (edit?.weight ?? persistedSubtopicSum) : persistedSubtopicSum,
        )
      : weight;
  const topicWeightInputDisabled =
    readOnly || topicWeightFromSubtopics || editingPersistedSubtopicSplit;

  return (
    <Modal
      open={open}
      title={isEdit ? "Edit topic" : "Add topic"}
      description={
        isEdit
          ? hasPersistedSubtopics
            ? "Edit the topic and manage its subtopics below."
            : "Change the name and weight, or add optional subtopics (same rules as when creating a topic)."
          : "Syllabus topics count toward phases, calendar, and stats. Optionally add subtopics."
      }
      onClose={onClose}
      wide="2xl"
    >
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            setError(null);
            if (isEdit && edit) {
              if (!readOnly) {
                if (edit.subtopics.length === 0) {
                  if (edit.completedAt) {
                    if (draftSubtopics.length > 0) {
                      setError(
                        "Subtopics cannot be added after this topic was completed as a leaf.",
                      );
                      return;
                    }
                    const w = parsePositiveWeight(weight);
                    if (w == null) {
                      setError(
                        "Enter a valid numeric weight greater than zero.",
                      );
                      return;
                    }
                    await updateTopic(edit.id, {
                      title,
                      weight: w,
                      notes: topicNotes.trim() || null,
                    });
                  } else if (draftSubtopics.length === 1) {
                    setError(
                      "If you add subtopics, include at least two — or leave subtopics empty for a leaf topic.",
                    );
                    return;
                  } else if (draftSubtopics.length >= 2) {
                    await updateTopic(edit.id, {
                      title,
                      weight: draftSubtopicSum,
                      notes: topicNotes.trim() || null,
                    });
                    await splitTopicIntoSubtopics(
                      edit.id,
                      draftSubtopics.map((d) => ({
                        title: d.title,
                        weight: d.weight,
                      })),
                    );
                  } else {
                    const w = parsePositiveWeight(weight);
                    if (w == null) {
                      setError(
                        "Enter a valid numeric weight greater than zero.",
                      );
                      return;
                    }
                    await updateTopic(edit.id, {
                      title,
                      weight: w,
                      notes: topicNotes.trim() || null,
                    });
                  }
                } else if (edit.subtopics.length > 0) {
                  if (editedSubtopics.length === 0) {
                    const leafWeight = parsePositiveWeight(weight);
                    if (leafWeight == null) {
                      setError(
                        "Enter a valid numeric weight greater than zero.",
                      );
                      return;
                    }
                    await deleteAllSubtopicsFromTopic(edit.id);
                    await updateTopic(edit.id, {
                      title,
                      weight: leafWeight,
                      notes: topicNotes.trim() || null,
                    });
                  } else {
                    const validationError = validateSubtopicListItems(
                      editedSubtopics,
                    );
                    if (validationError) {
                      setError(validationError);
                      return;
                    }
                    const original = edit.subtopics;
                    const originalIds = new Set(original.map((s) => s.id));
                    const keptIds = new Set(
                      editedSubtopics.filter((s) => !s.isNew).map((s) => s.id),
                    );
                    for (const s of original) {
                      if (!keptIds.has(s.id)) {
                        await deleteSubtopic(s.id);
                      }
                    }
                    const createdIdByDraftId = new Map<string, string>();
                    for (const row of editedSubtopics) {
                      const titleTrim = row.title.trim();
                      const w = parsePositiveWeight(String(row.weight))!;
                      const notesTrim = row.notes?.trim() || null;
                      if (row.isNew) {
                        const createdId = await createSubtopic(edit.id, {
                          title: titleTrim,
                          weight: w,
                          notes: notesTrim,
                        });
                        createdIdByDraftId.set(row.id, createdId);
                      } else if (originalIds.has(row.id)) {
                        const prev = original.find((s) => s.id === row.id)!;
                        const prevNotes = prev.notes?.trim() || null;
                        if (
                          prev.title !== titleTrim ||
                          prev.weight !== w ||
                          prevNotes !== notesTrim
                        ) {
                          await updateSubtopic(row.id, {
                            title: titleTrim,
                            weight: w,
                            notes: notesTrim,
                          });
                        }
                      }
                    }
                    const orderedIds = editedSubtopics.map(
                      (row) => createdIdByDraftId.get(row.id) ?? row.id,
                    );
                    await reorderSubtopics(edit.id, orderedIds);
                    await updateTopic(edit.id, {
                      title,
                      notes: topicNotes.trim() || null,
                    });
                    await setTopicWeightFromSubtopics(edit.id);
                  }
                }
              }
            } else {
              if (draftSubtopics.length === 1) {
                setError(
                  "If you add subtopics, include at least two — or leave subtopics empty for a leaf topic.",
                );
                return;
              }
              if (draftSubtopics.length === 0) {
                const leafWeight = parsePositiveWeight(weight);
                if (leafWeight == null) {
                  setError("Enter a valid numeric weight greater than zero.");
                  return;
                }
              }
              const baseWeight =
                draftSubtopics.length >= 2
                  ? draftSubtopicSum
                  : parsePositiveWeight(weight)!;
              await createTopicWithSubtopics(
                subject,
                {
                  title,
                  weight: baseWeight,
                  notes: topicNotes.trim() || null,
                },
                draftSubtopics.map((d) => ({ title: d.title, weight: d.weight })),
              );
            }
            onSaved();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed");
          }
        }}
      >
        {!isEdit && (
          <label className="block text-xs text-[var(--text-muted)]">
            Subject
            <select
              className="input mt-1"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
        )}
        <input
          className="input"
          placeholder="Topic title"
          value={title}
          required
          disabled={readOnly && isEdit}
          onChange={(e) => setTitle(e.target.value)}
        />
        {(!readOnly || isEdit) && (
          <label className="block text-xs text-[var(--text-muted)]">
            Topic notes
            <textarea
              className="input mt-1 min-h-[64px] text-xs"
              value={topicNotes}
              disabled={readOnly}
              placeholder="Optional — shown on any scheduled day for this topic"
              onChange={(e) => setTopicNotes(e.target.value)}
            />
          </label>
        )}
        <div>
          <input
            className="input w-24 font-mono text-xs"
            placeholder={topicWeightFromSubtopics ? undefined : "Weight"}
            value={topicWeightFieldValue}
            disabled={topicWeightInputDisabled}
            inputMode="decimal"
            onChange={(e) => setWeight(sanitizeWeightInput(e.target.value))}
          />
          {collapsedSubtopicsToLeaf && !readOnly ? (
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              All subtopics removed — set the topic weight for this leaf topic, then save.
            </p>
          ) : null}
          {(editingPersistedSubtopicSplit && !readOnly) ||
          topicWeightFromSubtopics ? (
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              Topic weight is the sum of subtopic weights — adjust subtopics below, not this
              field.
            </p>
          ) : null}
        </div>
        {editLeaf && !readOnly && (
          <DraftSubtopicsEditor
            drafts={draftSubtopics}
            onChange={setDraftSubtopics}
          />
        )}
        {isEdit && edit && edit.subtopics.length === 0 && edit.completedAt && (
          <p className="rounded-lg border border-[var(--border)] bg-[var(--bg-muted)]/40 px-3 py-2 text-xs text-[var(--text-muted)]">
            This topic was completed as a leaf — subtopics cannot be added after the fact.
          </p>
        )}
        {isEdit && edit && edit.subtopics.length > 0 && (
          <PersistedSubtopicsEditor
            subtopics={editedSubtopics}
            onChange={setEditedSubtopics}
            readOnly={readOnly}
            topicTitle={title}
            topicWeight={persistedSubtopicSum || edit.weight}
            topicCompletedAt={edit.completedAt}
          />
        )}
        {!isEdit && !readOnly && (
          <DraftSubtopicsEditor
            drafts={draftSubtopics}
            onChange={setDraftSubtopics}
          />
        )}
        {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {isEdit && edit && !readOnly ? (
            <button
              type="button"
              className="btn btn-trash inline-flex items-center gap-1.5 text-xs"
              onClick={() => onRequestDelete(edit)}
            >
              <TrashIcon className={TRASH_ICON_CLASS} />
              Delete topic
            </button>
          ) : (
            <span />
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={onClose}>
              {readOnly && isEdit ? "Close" : "Cancel"}
            </button>
            {(!readOnly || !isEdit) && (
              <button type="submit" className="btn btn-primary">
                {isEdit ? "Save" : "Add topic"}
              </button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}