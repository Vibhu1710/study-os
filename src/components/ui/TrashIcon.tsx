import { Trash2 } from "lucide-react";

/** Matches syllabus row action buttons (−φ / +φ) at `text-[9px]`. */
export const TRASH_ICON_CLASS = "size-[15px] shrink-0";

export function TrashIcon({ className }: { className?: string }) {
  return (
    <Trash2
      className={className ?? TRASH_ICON_CLASS}
      strokeWidth={2}
      aria-hidden
    />
  );
}
