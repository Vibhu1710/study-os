"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, StickyNote } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { DangerousSubtopicDeleteModal } from "@/components/syllabus/DangerousSubtopicDeleteModal";
import { TrashIcon, TRASH_ICON_CLASS } from "@/components/ui/TrashIcon";
import { subtopicDeleteImpact } from "@/lib/syllabus-delete";
import {
  parsePositiveWeight,
  sanitizeWeightInput,
} from "@/lib/syllabus-weight-input";
import {
  formatWeightDisplay,
  roundWeightTenth,
  spreadWeightsEvenly,
} from "@/lib/weight";

export type SubtopicRow = {
  id: string;
  title: string;
  weight: number;
  completedAt: string | null;
};

export type DraftSubtopic = { id: string; title: string; weight: number };

export type SubtopicListItem = {
  id: string;
  title: string;
  weight: number;
  completedAt?: string | null;
  notes?: string | null;
  isNew?: boolean;
};

function SortableSubtopicTableRow({
  row,
  readOnly,
  pct,
  pctBase,
  weightFieldValue,
  notesExpanded,
  onToggleNotes,
  onUpdate,
  onWeightDraftChange,
  onWeightBlur,
  onRemove,
}: {
  row: SubtopicListItem;
  readOnly: boolean;
  pct: number;
  pctBase: number;
  weightFieldValue: string;
  notesExpanded: boolean;
  onToggleNotes: () => void;
  onUpdate: (patch: Partial<SubtopicListItem>) => void;
  onWeightDraftChange: (raw: string) => void;
  onWeightBlur: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id, disabled: readOnly });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const hasNote = Boolean(row.notes?.trim());

  return (
    <>
      <tr
        ref={setNodeRef}
        style={style}
        className={cn(
          "border-t border-[var(--border)]",
          isDragging && "relative z-10 bg-[var(--bg-elevated)]",
        )}
      >
        {!readOnly && (
          <td className="w-8 shrink-0 py-1.5 pl-0.5 pr-0 align-middle">
            <button
              type="button"
              ref={setActivatorNodeRef}
              className="flex h-7 w-7 cursor-grab items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-muted)] active:cursor-grabbing"
              aria-label={`Reorder ${row.title}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          </td>
        )}
        <td className="min-w-0 px-2 py-1.5">
          <input
            className="input w-full min-w-0 py-1 text-xs"
            value={row.title}
            disabled={readOnly}
            onChange={(e) => onUpdate({ title: e.target.value })}
          />
        </td>
        <td className="w-[4.5rem] shrink-0 px-1.5 py-1.5">
          <input
            className="input w-full py-1 text-xs font-mono tabular-nums"
            value={weightFieldValue}
            disabled={readOnly}
            inputMode="decimal"
            onChange={(e) => onWeightDraftChange(sanitizeWeightInput(e.target.value))}
            onBlur={onWeightBlur}
          />
        </td>
        <td className="w-10 shrink-0 px-1.5 py-1.5 text-right font-mono tabular-nums text-[var(--text-muted)]">
          {pctBase > 0 ? pct : 0}%
        </td>
        {!readOnly && (
          <td className="w-[4.75rem] shrink-0 py-1.5 pl-1 pr-3 text-right">
            <div className="inline-flex items-center justify-end gap-1">
              <button
                type="button"
                className={cn(
                  "btn inline-flex h-[22px] min-w-[26px] items-center justify-center px-1.5 py-0.5 text-[9px] leading-none",
                  (hasNote || notesExpanded) && "text-[var(--accent)]",
                )}
                aria-label={`Notes for ${row.title}`}
                title="Subtopic notes"
                onClick={onToggleNotes}
              >
                <StickyNote className="h-3 w-3" />
              </button>
              <button
                type="button"
                className="btn btn-trash inline-flex h-[22px] min-w-[26px] items-center justify-center px-1.5 py-0.5 text-[9px] leading-none"
                aria-label={`Remove subtopic ${row.title}`}
                title="Remove subtopic"
                onClick={onRemove}
              >
                <TrashIcon className={TRASH_ICON_CLASS} />
              </button>
            </div>
          </td>
        )}
      </tr>
      {!readOnly && notesExpanded && (
        <tr className="border-t border-[var(--border)]/60 bg-[var(--bg-muted)]/20">
          <td colSpan={5} className="px-2 py-2">
            <label className="block text-[9px] text-[var(--text-muted)]">
              Note
              <textarea
                className="input mt-1 min-h-[52px] w-full text-xs"
                value={row.notes ?? ""}
                placeholder="Optional — visible on any day this topic is scheduled"
                onChange={(e) => onUpdate({ notes: e.target.value })}
              />
            </label>
          </td>
        </tr>
      )}
      {readOnly && hasNote && (
        <tr className="border-t border-[var(--border)]/40">
          <td colSpan={readOnly ? 3 : 5} className="px-2 py-1.5">
            <p className="text-[10px] leading-relaxed text-[var(--text-muted)] whitespace-pre-wrap">
              {row.notes?.trim()}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

export function validateSubtopicListItems(
  items: SubtopicListItem[],
  { allowEmpty = false }: { allowEmpty?: boolean } = {},
): string | null {
  if (items.length === 1) {
    return "A topic cannot have only one subtopic — keep at least two or remove subtopics to use a leaf topic.";
  }
  if (!allowEmpty && items.length === 0) {
    return "Add at least two subtopics.";
  }
  for (const row of items) {
    if (!row.title.trim()) {
      return "Every subtopic needs a name.";
    }
    const w = parsePositiveWeight(String(row.weight));
    if (w == null) {
      return "Each subtopic needs a valid numeric weight greater than zero.";
    }
  }
  return null;
}

function SubtopicsListEditor({
  items,
  onChange,
  readOnly = false,
  variant,
  topicTitle,
  topicWeight,
  topicCompletedAt,
}: {
  items: SubtopicListItem[];
  onChange: (next: SubtopicListItem[]) => void;
  readOnly?: boolean;
  variant: "optional" | "existing";
  topicTitle?: string;
  topicWeight?: number;
  topicCompletedAt?: string | null;
}) {
  const [newTitle, setNewTitle] = useState("");
  const [newWeight, setNewWeight] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SubtopicListItem | null>(
    null,
  );
  const [weightDrafts, setWeightDrafts] = useState<Record<string, string>>({});
  const [expandedNotesIds, setExpandedNotesIds] = useState<Set<string>>(
    () => new Set(),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    setWeightDrafts((prev) => {
      const ids = new Set(items.map((i) => i.id));
      const next: Record<string, string> = {};
      for (const [id, text] of Object.entries(prev)) {
        if (ids.has(id)) next[id] = text;
      }
      return next;
    });
  }, [items]);

  function weightFieldValue(row: SubtopicListItem): string {
    if (Object.prototype.hasOwnProperty.call(weightDrafts, row.id)) {
      return weightDrafts[row.id];
    }
    return row.weight > 0 ? formatWeightDisplay(row.weight) : "";
  }

  const topicTotal = useMemo(
    () => roundWeightTenth(items.reduce((s, x) => s + x.weight, 0)),
    [items],
  );
  const pctBase = topicTotal > 0 ? topicTotal : 0;

  function updateItem(id: string, patch: Partial<SubtopicListItem>) {
    onChange(items.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function addItem() {
    setAddError(null);
    const title = newTitle.trim();
    if (!title) return;
    const w = parsePositiveWeight(newWeight);
    if (w == null) {
      setAddError("Enter a valid numeric weight greater than zero.");
      return;
    }
    onChange([
      ...items,
      { id: crypto.randomUUID(), title, weight: w, isNew: true },
    ]);
    setNewTitle("");
    setNewWeight("");
  }

  function removeItem(row: SubtopicListItem) {
    if (row.isNew) {
      onChange(items.filter((x) => x.id !== row.id));
      setAddError(null);
      return;
    }
    setConfirmDelete(row);
  }

  function spreadEvenly() {
    setAddError(null);
    if (items.length < 2) return;
    if (topicTotal <= 0) {
      setAddError("Enter subtopic weights first — total must be greater than zero.");
      return;
    }
    const weights = spreadWeightsEvenly(topicTotal, items.length);
    onChange(items.map((row, i) => ({ ...row, weight: weights[i] ?? row.weight })));
    setWeightDrafts({});
  }

  const canSpreadEvenly = !readOnly && items.length >= 2 && topicTotal > 0;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(items, oldIndex, newIndex));
  }

  function toggleNotesExpanded(id: string) {
    setExpandedNotesIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const heading =
    variant === "optional" ? "Subtopics (optional)" : "Subtopics";
  const helper =
    variant === "optional"
      ? "Leave empty for a leaf topic, or add at least two. With two or more, each subtopic weight sets the topic total above."
      : "Each subtopic weight sets the topic total above. Add or edit rows below, then save the topic.";

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
      <div className="mb-3">
        <h3 className="font-mono text-xs uppercase tracking-wide text-[var(--accent)]">
          {heading}
        </h3>
        <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{helper}</p>
        {items.length >= 2 && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)]/60 pt-2">
            <p className="font-mono text-[10px] text-[var(--text-muted)]">
              Topic total{" "}
              <span className="text-[var(--text)]">
                {formatWeightDisplay(topicTotal)}
              </span>{" "}
              wt
            </p>
            {!readOnly && (
              <button
                type="button"
                className="btn shrink-0 px-2 py-0.5 text-[10px] leading-snug disabled:opacity-40"
                disabled={!canSpreadEvenly}
                title={
                  canSpreadEvenly
                    ? `Split ${formatWeightDisplay(topicTotal)} wt evenly across ${items.length} subtopics`
                    : "Set subtopic weights first (total must be greater than zero)"
                }
                onClick={spreadEvenly}
              >
                Spread evenly
              </button>
            )}
          </div>
        )}
      </div>

      {items.length === 1 && (
        <p className="mb-3 text-xs text-[var(--accent-amber)]">
          Add one more subtopic below, or remove the row above to keep this as a
          leaf topic.
        </p>
      )}

      {items.length > 0 && (
        <div className="mb-4 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg-muted)]/30 px-2 py-3 sm:px-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <table className="w-full min-w-[22rem] text-left text-xs">
              <thead className="font-mono text-[9px] uppercase text-[var(--text-muted)]">
                <tr>
                  {!readOnly && (
                    <th className="w-8 pb-1.5 pt-0.5" aria-label="Reorder" />
                  )}
                  <th className="pb-1.5 pt-0.5 pl-2">Name</th>
                  <th className="w-[4.5rem] shrink-0 pb-1.5 pt-0.5 pl-1.5">
                    Wt
                  </th>
                  <th className="w-10 shrink-0 pb-1.5 pt-0.5 pr-1 text-right">
                    %
                  </th>
                  {!readOnly && (
                    <th
                      className="w-[4.75rem] shrink-0 pb-1.5 pt-0.5 pr-3 text-right"
                      aria-label="Actions"
                    />
                  )}
                </tr>
              </thead>
              <SortableContext
                items={items.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <tbody>
                  {items.map((d) => {
                    const pct =
                      pctBase > 0 ? Math.round((d.weight / pctBase) * 100) : 0;
                    return (
                      <SortableSubtopicTableRow
                        key={d.id}
                        row={d}
                        readOnly={readOnly}
                        pct={pct}
                        pctBase={pctBase}
                        weightFieldValue={weightFieldValue(d)}
                        notesExpanded={expandedNotesIds.has(d.id)}
                        onToggleNotes={() => toggleNotesExpanded(d.id)}
                        onUpdate={(patch) => updateItem(d.id, patch)}
                        onWeightDraftChange={(raw) => {
                          setWeightDrafts((prev) => ({ ...prev, [d.id]: raw }));
                          if (raw === "" || raw === ".") {
                            updateItem(d.id, { weight: 0 });
                            return;
                          }
                          const n = parseFloat(raw);
                          if (Number.isFinite(n) && n >= 0) {
                            updateItem(d.id, { weight: roundWeightTenth(n) });
                          }
                        }}
                        onWeightBlur={() => {
                          setWeightDrafts((prev) => {
                            if (!Object.prototype.hasOwnProperty.call(prev, d.id)) {
                              return prev;
                            }
                            const { [d.id]: _, ...rest } = prev;
                            return rest;
                          });
                        }}
                        onRemove={() => removeItem(d)}
                      />
                    );
                  })}
                </tbody>
              </SortableContext>
            </table>
          </DndContext>
        </div>
      )}

      {readOnly && items.length === 0 && (
        <p className="text-xs text-[var(--text-muted)]">No subtopics.</p>
      )}

      {!readOnly && (
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-muted)]/20 p-3">
          <p className="mb-2 font-mono text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
            Add subtopic
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-[10px] text-[var(--text-muted)]">
              Name
              <input
                className="input mt-1 w-full text-xs"
                placeholder="Subtopic title"
                value={newTitle}
                onChange={(e) => {
                  setNewTitle(e.target.value);
                  setAddError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addItem();
                  }
                }}
              />
            </label>
            <label className="w-full text-[10px] text-[var(--text-muted)] sm:w-24">
              Weight
              <input
                className="input mt-1 w-full text-xs font-mono"
                placeholder="Weight"
                inputMode="decimal"
                value={newWeight}
                onChange={(e) => {
                  setNewWeight(sanitizeWeightInput(e.target.value));
                  setAddError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addItem();
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="btn btn-primary shrink-0 text-xs sm:mb-0.5"
              disabled={!newTitle.trim()}
              onClick={addItem}
            >
              Add to list
            </button>
          </div>
          {addError && (
            <p className="mt-2 text-[10px] text-[var(--danger)]">{addError}</p>
          )}
        </div>
      )}

      {confirmDelete && (
        <DangerousSubtopicDeleteModal
          open
          subtopicTitle={confirmDelete.title}
          topicTitle={topicTitle ?? "this topic"}
          impact={subtopicDeleteImpact(
            {
              title: confirmDelete.title,
              weight: confirmDelete.weight,
              completedAt: confirmDelete.completedAt ?? null,
            },
            {
              weight: topicWeight ?? confirmDelete.weight,
              completedAt: topicCompletedAt ?? null,
            },
            items.map((s) => ({
              title: s.title,
              weight: s.weight,
              completedAt: s.completedAt ?? null,
            })),
          )}
          pending={false}
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => {
            const row = confirmDelete;
            setConfirmDelete(null);
            onChange(items.filter((x) => x.id !== row.id));
            setAddError(null);
          }}
        />
      )}
    </div>
  );
}

export function DraftSubtopicsEditor({
  drafts,
  onChange,
}: {
  drafts: DraftSubtopic[];
  onChange: (next: DraftSubtopic[]) => void;
}) {
  const items: SubtopicListItem[] = drafts;
  return (
    <SubtopicsListEditor
      variant="optional"
      items={items}
      onChange={(next) =>
        onChange(
          next.map(({ id, title, weight }) => ({ id, title, weight })),
        )
      }
    />
  );
}

export function PersistedSubtopicsEditor({
  subtopics,
  onChange,
  readOnly = false,
  topicTitle,
  topicWeight,
  topicCompletedAt = null,
}: {
  subtopics: SubtopicListItem[];
  onChange: (next: SubtopicListItem[]) => void;
  readOnly?: boolean;
  topicTitle: string;
  topicWeight: number;
  topicCompletedAt?: string | null;
}) {
  return (
    <SubtopicsListEditor
      variant="existing"
      items={subtopics}
      onChange={onChange}
      readOnly={readOnly}
      topicTitle={topicTitle}
      topicWeight={topicWeight}
      topicCompletedAt={topicCompletedAt}
    />
  );
}
