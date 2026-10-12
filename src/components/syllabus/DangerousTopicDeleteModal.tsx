"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { TopicDeleteImpact } from "@/lib/syllabus-delete";

export function DangerousTopicDeleteModal({
  open,
  topicTitle,
  impact,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  topicTitle: string;
  impact: TopicDeleteImpact | null;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const busy = pending || confirming;

  const resolvedImpact: TopicDeleteImpact = impact ?? {
    hasCommittedProgress: false,
    subtopicCount: 0,
    inPhase: false,
  };

  return (
    <Modal
      open={open}
      title="Delete topic?"
      description={`Remove “${topicTitle}” from this syllabus.`}
      onClose={onClose}
    >
      <p className="text-sm text-[var(--text-muted)]">
        This only affects this topic—not your whole objective or other subjects. It will
        still remove this topic&apos;s plan rows, notes, completion logs, and dashboard
        credit tied to it.
        {resolvedImpact.hasCommittedProgress
          ? " Past-day logs for this topic are included."
          : null}
      </p>

      <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-[var(--text-muted)]">
        <li>Calendar / Today entries for this topic</li>
        <li>Completion and notes for this topic</li>
        {resolvedImpact.inPhase && <li>Link from current phase targets</li>}
        {resolvedImpact.subtopicCount > 0 && (
          <li>
            {resolvedImpact.subtopicCount} subtopic
            {resolvedImpact.subtopicCount === 1 ? "" : "s"} under this topic
          </li>
        )}
      </ul>

      <div className="mt-5 flex justify-end gap-2 pt-2">
        <button type="button" className="btn" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-danger disabled:opacity-40"
          disabled={busy}
          onClick={() => {
            setConfirming(true);
            void Promise.resolve(onConfirm()).finally(() => setConfirming(false));
          }}
        >
          {confirming ? "Deleting…" : "Delete topic"}
        </button>
      </div>
    </Modal>
  );
}
