"use client";

import { Modal } from "@/components/ui/Modal";

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Delete",
  danger = true,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <Modal open={open} title={title} description={description} onClose={onClose}>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn" disabled={pending} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={danger ? "btn btn-primary bg-[var(--danger)]" : "btn btn-primary"}
          disabled={pending}
          onClick={() => onConfirm()}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
