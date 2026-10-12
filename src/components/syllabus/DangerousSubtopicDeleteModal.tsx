"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { SubtopicDeleteImpact } from "@/lib/syllabus-delete";

export function DangerousSubtopicDeleteModal({
  open,
  subtopicTitle,
  topicTitle,
  impact,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  subtopicTitle: string;
  topicTitle: string;
  impact: SubtopicDeleteImpact | null;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const busy = pending || confirming;

  const resolvedImpact: SubtopicDeleteImpact = impact ?? {
    hasCommittedProgress: false,
    subtopicTitle: subtopicTitle,
    topicHasOtherSubtopics: true,
  };

  return (
    <Modal
      open={open}
      title="Delete subtopic?"
      description={`Remove “${subtopicTitle}” from “${topicTitle}”.`}
      onClose={onClose}
    >
      <p className="text-sm text-[var(--text-muted)]">
        The parent topic stays. This clears this subtopic&apos;s schedule, notes, and
        completion logs.
        {resolvedImpact.hasCommittedProgress ? " Past logs for this subtopic are included." : null}
      </p>

      {resolvedImpact.topicHasOtherSubtopics && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Topic progress % will update without this subtopic&apos;s weight.
        </p>
      )}

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
          {confirming ? "Deleting…" : "Delete subtopic"}
        </button>
      </div>
    </Modal>
  );
}
