"use client";

import { cn } from "@/lib/cn";
import {
  conflictsWithAnySubjectColor,
  isReservedCalendarHeatColor,
  SUBJECT_COLOR_PALETTE,
} from "@/lib/subject-colors";

export function SubjectColorField({
  value,
  onChange,
  otherSubjectColors = [],
}: {
  value: string;
  onChange: (color: string) => void;
  /** Sibling subjects — swatches too close to these are disabled. */
  otherSubjectColors?: string[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--text-muted)]">
        Color — same on syllabus, calendar, and dashboard
      </p>
      <div className="flex flex-wrap gap-1.5">
        {SUBJECT_COLOR_PALETTE.map((c) => {
          const blocked =
            isReservedCalendarHeatColor(c) ||
            conflictsWithAnySubjectColor(c, otherSubjectColors);
          return (
            <button
              key={c}
              type="button"
              title={blocked ? `${c} — too close to another subject or reserved` : c}
              disabled={blocked}
              className={cn(
                "h-7 w-7 rounded-sm transition-transform",
                blocked
                  ? "cursor-not-allowed opacity-25 ring-1 ring-[var(--border)]"
                  : "hover:scale-105 ring-1 ring-[var(--border)]",
                !blocked &&
                  value.toLowerCase() === c.toLowerCase() &&
                  "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg-elevated)]",
              )}
              style={{ background: c }}
              onClick={() => !blocked && onChange(c)}
            />
          );
        })}
      </div>
      <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        Custom
        <input
          type="color"
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            if (
              isReservedCalendarHeatColor(next) ||
              conflictsWithAnySubjectColor(next, otherSubjectColors)
            ) {
              return;
            }
            onChange(next);
          }}
        />
      </label>
    </div>
  );
}
