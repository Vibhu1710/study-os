"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { formatWeightDisplay } from "@/lib/weight";

type DayDetailPayload = {
  events: {
    id: string;
    topicId: string;
    subtopicId: string | null;
    weightSnapshot: number;
    topic: { title: string };
    subtopic: { id: string; title: string } | null;
    subject: { name: string; color: string };
  }[];
  planItems: {
    id: string;
    topicId: string;
    subtopicId: string | null;
    topic: {
      title: string;
      weight: number;
      subject: { name: string; color: string };
      subtopics: { id: string; title: string; weight: number }[];
    };
    subtopic?: { title: string; weight: number } | null;
  }[];
};

/** Read-only snapshot of what was logged on a past day (whole objective). */
export function EditLogDayPreview({
  date,
  detail,
  loading,
}: {
  date: string | null;
  detail: DayDetailPayload | null;
  loading: boolean;
}) {
  const groups = useMemo(() => {
    if (!detail) return [];
    const byTopic = new Map<
      string,
      {
        topicId: string;
        title: string;
        color: string;
        subjectName: string;
        rows: { label: string; weight: number; logged: boolean }[];
      }
    >();

    for (const ev of detail.events) {
      let g = byTopic.get(ev.topicId);
      if (!g) {
        g = {
          topicId: ev.topicId,
          title: ev.topic.title,
          color: ev.subject.color,
          subjectName: ev.subject.name,
          rows: [],
        };
        byTopic.set(ev.topicId, g);
      }
      g.rows.push({
        label: ev.subtopic ? ev.subtopic.title : ev.topic.title,
        weight: ev.weightSnapshot,
        logged: true,
      });
    }

    return [...byTopic.values()];
  }, [detail]);

  if (!date) {
    return (
      <p className="text-xs text-[var(--text-muted)]">
        Pick a past day to see what was logged that day.
      </p>
    );
  }

  if (loading) {
    return <p className="text-xs text-[var(--text-muted)]">Loading…</p>;
  }

  if (groups.length === 0) {
    return (
      <p className="text-xs text-[var(--text-muted)]">
        Nothing logged on <span className="font-mono">{date}</span>.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        Logged on {date}
      </p>
      {groups.map((g) => (
        <div
          key={g.topicId}
          className="rounded-lg border border-[var(--border)]"
          style={{ borderLeftWidth: 3, borderLeftColor: g.color }}
        >
          <div className="bg-[var(--bg-muted)]/30 px-3 py-2">
            <p className="text-sm font-medium leading-snug">{g.title}</p>
            <p className="font-mono text-[10px] text-[var(--text-muted)]">{g.subjectName}</p>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {g.rows.map((row, i) => (
              <li
                key={i}
                className={cn(
                  "flex items-center justify-between gap-2 px-3 py-2 text-sm",
                  row.logged && "bg-emerald-950/20",
                )}
              >
                <span className="min-w-0 truncate">{row.label}</span>
                <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
                  {formatWeightDisplay(row.weight)} wt
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
