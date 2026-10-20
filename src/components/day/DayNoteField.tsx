"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { upsertDayNote } from "@/lib/actions/day";
import { upsertRhythmDayNote } from "@/lib/actions/rhythm";

export type DayNoteFieldKind = "coverage" | "effort";

const PRESETS: Record<
  DayNoteFieldKind,
  { label: string; placeholder: string; addLabel: string }
> = {
  coverage: {
    label: "Day notes",
    placeholder: "Anything extra for this day — not tied to a topic…",
    addLabel: "Add day note",
  },
  effort: {
    label: "Momentum note",
    placeholder:
      "How the day went — energy, distractions, why study time looked the way it did…",
    addLabel: "Add note",
  },
};

/** Day-level journal — coverage uses calendar day_notes; effort uses rhythm_day_notes. */
export function DayNoteField({
  objectiveId,
  date,
  dayNote,
  canEdit,
  kind = "coverage",
  label,
  placeholder,
  addLabel,
  onPersisted,
}: {
  objectiveId: string;
  date: string;
  dayNote?: string | null;
  canEdit: boolean;
  kind?: DayNoteFieldKind;
  label?: string;
  placeholder?: string;
  addLabel?: string;
  onPersisted?: () => void | Promise<void>;
}) {
  const preset = PRESETS[kind];
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(dayNote ?? "");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setDraft(dayNote ?? "");
    setEditing(false);
  }, [date, dayNote, kind]);

  const hasBody = draft.trim().length > 0 || (dayNote?.trim().length ?? 0) > 0;
  if (!canEdit && !dayNote?.trim()) return null;

  async function persist(body: string) {
    if (kind === "effort") {
      await upsertRhythmDayNote({ objectiveId, date, body });
    } else {
      await upsertDayNote({ objectiveId, date, body });
    }
  }

  return (
    <div className="mb-3 border-b border-[var(--border)] pb-3 pt-2">
      <p className="font-mono text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
        {label ?? preset.label}
      </p>
      {editing && canEdit ? (
        <textarea
          className="input mt-1.5 min-h-[56px] text-xs"
          value={draft}
          autoFocus
          disabled={pending}
          placeholder={placeholder ?? preset.placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            startTransition(async () => {
              await persist(draft);
              setEditing(false);
              await onPersisted?.();
              router.refresh();
            });
          }}
        />
      ) : hasBody ? (
        <p
          className={cn(
            "mt-1.5 text-xs leading-relaxed text-[var(--text-muted)] whitespace-pre-wrap",
            canEdit && "cursor-text",
          )}
          title={canEdit ? "Double-click to edit" : undefined}
          onDoubleClick={() => {
            if (!canEdit) return;
            setEditing(true);
          }}
        >
          {(draft.trim() || dayNote?.trim() || "").trim()}
        </p>
      ) : canEdit ? (
        <button
          type="button"
          className="mt-1.5 block text-left text-xs text-[var(--accent)]"
          onClick={() => setEditing(true)}
        >
          {addLabel ?? preset.addLabel}
        </button>
      ) : null}
    </div>
  );
}
