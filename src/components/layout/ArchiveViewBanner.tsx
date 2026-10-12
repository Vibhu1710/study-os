"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { returnToActiveCycle } from "@/lib/actions/objectives";

export function ArchiveViewBanner({
  archiveName,
  activeName,
}: {
  archiveName: string;
  activeName: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div
      className="border-b border-[var(--accent-amber)]/40 bg-[color-mix(in_srgb,var(--accent-amber)_12%,var(--bg-elevated))] px-4 py-2"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-mono text-[10px] uppercase text-[var(--accent-amber)]">
            History view
          </span>
          <span className="ml-2 text-[var(--text-muted)]">
            {archiveName}
            {activeName ? ` — your live cycle is ${activeName}` : ""}
          </span>
        </p>
        <button
          type="button"
          className="btn btn-primary text-xs"
          disabled={pending || !activeName}
          onClick={() =>
            startTransition(async () => {
              await returnToActiveCycle();
              router.refresh();
            })
          }
        >
          Back to current cycle
        </button>
      </div>
    </div>
  );
}
