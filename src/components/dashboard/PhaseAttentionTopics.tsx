"use client";

import type { PhaseAttentionTopicRow } from "@/lib/actions/phase-dashboard";
import { cn } from "@/lib/cn";

const REASON_LABEL = {
  missed: "Missed plan",
  never: "Never started",
  stalled: "Stalled",
} as const;

export function PhaseAttentionTopics({
  topics,
  selectedTopicId,
  onSelect,
}: {
  topics: PhaseAttentionTopicRow[];
  selectedTopicId: string | null;
  onSelect: (topicId: string) => void;
}) {
  if (topics.length === 0) return null;

  return (
    <div>
      <p className="mb-3 font-mono text-[10px] leading-relaxed text-[var(--text-muted)]">
        Heavy topics you have not started, or a planned day still not followed
        by any log on that topic.
      </p>
      <ul className="space-y-2">
        {topics.map((t) => {
          const selected = selectedTopicId === t.topicId;
          return (
            <li key={t.topicId}>
              <button
                type="button"
                onClick={() => onSelect(t.topicId)}
                className={cn(
                  "flex w-full items-start justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--bg-muted)]/25 px-3 py-2 text-left outline-none transition-colors",
                  "hover:bg-[var(--bg-muted)]/50",
                  "focus:outline-none focus-visible:outline-none",
                  selected && "bg-[var(--bg-muted)]",
                )}
              >
                <span className="min-w-0 leading-snug text-sm">
                  <span
                    className="mr-2 inline-block h-2 w-2 shrink-0 rounded-full align-middle"
                    style={{ background: t.subjectColor }}
                  />
                  <span className="text-[var(--text-muted)]">
                    {t.subjectName} ·{" "}
                  </span>
                  {t.title}
                </span>
                <span className="shrink-0 text-right font-mono text-[10px] text-[var(--text-muted)]">
                  <span className="block text-[var(--text)]">
                    {t.remainingWeight} wt
                  </span>
                  <span className="mt-0.5 block">
                    {REASON_LABEL[t.reason]}
                    {t.reason === "missed" && t.missedPlanDays > 1
                      ? ` · ${t.missedPlanDays} days`
                      : ""}
                    {t.reason === "stalled" && t.lastLogDate
                      ? ` · last ${t.lastLogDate.slice(5)}`
                      : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
