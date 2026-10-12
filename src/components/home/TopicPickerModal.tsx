"use client";

import { Fragment, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  isTopicComplete,
  topicProgressPercent,
  topicTotalWeight,
} from "@/lib/progress";
import type { HomeSubject } from "@/components/home/PhaseTargetsTable";

export type CompletionDates = {
  bySubtopicId: Record<string, string>;
  byTopicId: Record<string, string>;
};

function TickIcon({ done, color }: { done: boolean; color: string }) {
  if (!done) {
    return <span className="inline-block w-4 text-center text-[var(--text-muted)]">—</span>;
  }
  return (
    <span
      className="inline-flex h-4 w-4 items-center justify-center"
      style={{ color }}
      aria-hidden
    >
      ✓
    </span>
  );
}

export function TopicPickerModal({
  open,
  title,
  description,
  subjects,
  filterTopicIds,
  excludeTopicIds,
  completionDates,
  confirmLabel,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  subjects: HomeSubject[];
  /** If set, only these topic ids (still must be incomplete). */
  filterTopicIds?: Set<string>;
  /** Topics already in phase when adding — exclude from list optional */
  excludeTopicIds?: Set<string>;
  completionDates: CompletionDates;
  confirmLabel: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (topicIds: string[]) => void | Promise<void>;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const out: { subject: HomeSubject; topic: HomeSubject["topics"][0]; serial: number }[] = [];
    for (const subject of subjects) {
      let n = 0;
      for (const topic of subject.topics) {
        if (isTopicComplete(topic, topic.subtopics)) continue;
        if (filterTopicIds && !filterTopicIds.has(topic.id)) continue;
        if (excludeTopicIds?.has(topic.id)) continue;
        n += 1;
        out.push({ subject, topic, serial: n });
      }
    }
    return out;
  }, [subjects, filterTopicIds, excludeTopicIds]);

  const subjectsGrouped = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!map.has(row.subject.id)) map.set(row.subject.id, []);
      map.get(row.subject.id)!.push(row);
    }
    return [...map.entries()].map(([id, topicRows]) => ({
      subject: topicRows[0].subject,
      topicRows,
    }));
  }, [rows]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      wide="xl"
    >
      <div className="max-h-[min(60vh,28rem)] overflow-y-auto overflow-x-auto rounded-lg border border-[var(--border)]">
        {subjectsGrouped.length === 0 ? (
          <p className="p-4 text-xs text-[var(--text-muted)]">No topics available to add.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-[var(--border)] bg-[var(--bg-muted)] font-mono text-[10px] uppercase text-[var(--text-muted)]">
              <tr>
                <th className="w-8 px-2 py-2" />
                <th className="w-8 px-2 py-2">#</th>
                <th className="px-3 py-2">Topic</th>
                <th className="w-14 px-2 py-2">Wt</th>
                <th className="w-20 px-2 py-2">Progress</th>
              </tr>
            </thead>
            <tbody>
              {subjectsGrouped.map(({ subject, topicRows }) => (
                <Fragment key={subject.id}>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-muted)]/50">
                    <td colSpan={5} className="px-3 py-2">
                      <span
                        className="mr-2 inline-block h-2 w-2 rounded-full"
                        style={{ background: subject.color }}
                      />
                      <span className="font-medium">{subject.name}</span>
                    </td>
                  </tr>
                  {topicRows.map(({ topic, serial }) => {
                    const openRow = expandedTopicId === topic.id;
                    const pct = topicProgressPercent(topic, topic.subtopics);
                    return (
                      <Fragment key={topic.id}>
                        <tr className="border-b border-[var(--border)] hover:bg-[var(--bg-muted)]/30">
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              checked={picked.has(topic.id)}
                              style={{ accentColor: subject.color }}
                              onChange={() => toggle(topic.id)}
                            />
                          </td>
                          <td className="px-2 py-2 font-mono text-xs text-[var(--text-muted)]">
                            {serial}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="flex items-center gap-2 text-left"
                              onClick={() =>
                                setExpandedTopicId((id) => (id === topic.id ? null : topic.id))
                              }
                            >
                              {topic.subtopics.length > 0 && (
                                <span className="font-mono text-[10px] text-[var(--text-muted)]">
                                  {openRow ? "▾" : "▸"}
                                </span>
                              )}
                              <span className="font-medium">{topic.title}</span>
                            </button>
                          </td>
                          <td className="px-2 py-2 font-mono text-xs">
                            {topicTotalWeight(topic, topic.subtopics)}
                          </td>
                          <td className="px-2 py-2 font-mono text-[10px] text-[var(--text-muted)]">
                            {pct}%
                          </td>
                        </tr>
                        {openRow && topic.subtopics.length > 0 && (
                          <tr className="border-b border-[var(--border)] bg-[var(--bg-muted)]/20">
                            <td />
                            <td colSpan={4} className="px-3 py-2">
                              <table className="w-full text-xs">
                                <tbody>
                                  {topic.subtopics.map((s) => (
                                    <tr key={s.id}>
                                      <td className="w-8 py-0.5">
                                        <TickIcon
                                          done={Boolean(s.completedAt)}
                                          color={subject.color}
                                        />
                                      </td>
                                      <td className="py-0.5">{s.title}</td>
                                      <td className="w-12 font-mono py-0.5">{s.weight}</td>
                                      <td className="font-mono text-[10px] text-[var(--text-muted)]">
                                        {completionDates.bySubtopicId[s.id] ?? ""}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn" disabled={pending} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary disabled:opacity-40"
          disabled={pending || picked.size === 0}
          onClick={() => onConfirm([...picked])}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
