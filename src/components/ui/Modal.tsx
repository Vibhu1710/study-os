"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export function Modal({
  open,
  title,
  description,
  children,
  onClose,
  wide,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  /** `true` = lg; `"xl"` = 2xl; `"2xl"` = 3xl; `"3xl"` = 6xl for wide layouts */
  wide?: boolean | "xl" | "2xl" | "3xl";
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn(
          "card max-h-[90vh] w-full overflow-y-auto p-5 shadow-xl",
          wide === "3xl"
            ? "max-w-6xl"
            : wide === "2xl"
              ? "max-w-3xl"
              : wide === "xl"
                ? "max-w-2xl"
                : wide
                  ? "max-w-lg"
                  : "max-w-md",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="modal-title" className="text-lg font-semibold">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p>
            )}
          </div>
          <button type="button" className="btn px-2 py-1 text-xs" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
