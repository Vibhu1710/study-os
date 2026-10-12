"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function CycleHeaderControl({
  cycleName,
  dateRange,
  isArchiveView,
}: {
  cycleName: string | null;
  dateRange: string | null;
  isArchiveView: boolean;
}) {
  const pathname = usePathname();
  const onSettings = pathname === "/settings";

  const label = cycleName ?? "Set up study cycle";
  const sub = dateRange ?? "One active cycle at a time";

  return (
    <Link
      href="/settings"
      className={cn(
        "group flex max-w-[220px] items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors",
        onSettings
          ? "border-[var(--accent)] bg-[var(--bg-muted)]"
          : "border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)]/50 hover:bg-[var(--bg-muted)]",
        isArchiveView && "border-[var(--accent-amber)]/50",
      )}
      title="Study cycle settings"
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold",
          isArchiveView
            ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]"
            : "bg-[var(--accent)]/15 text-[var(--accent)]",
        )}
      >
        {isArchiveView ? "H" : "●"}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-xs font-medium leading-tight">{label}</span>
        <span className="block truncate font-mono text-[9px] leading-tight text-[var(--text-muted)]">
          {sub}
        </span>
      </span>
      <span className="shrink-0 text-[10px] text-[var(--text-muted)] group-hover:text-[var(--accent)]">
        ⚙
      </span>
    </Link>
  );
}
