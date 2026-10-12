import Link from "next/link";
import { ArchiveViewBanner } from "@/components/layout/ArchiveViewBanner";
import { AppNavLinks } from "@/components/layout/AppNavLinks";
import { AppShellStickyOffset } from "@/components/layout/AppShellStickyOffset";
import { CycleHeaderControl } from "@/components/layout/CycleHeaderControl";
import type { objectives } from "@/db/schema";

type ObjectiveRow = typeof objectives.$inferSelect;

export function AppShell({
  children,
  objectives: objectiveList,
  currentObjectiveId,
  activeObjectiveId,
  isArchiveView,
}: {
  children: React.ReactNode;
  objectives: ObjectiveRow[];
  currentObjectiveId: string | null;
  activeObjectiveId: string | null;
  isArchiveView: boolean;
}) {
  const viewing = objectiveList.find((o) => o.id === currentObjectiveId);
  const active = objectiveList.find((o) => o.id === activeObjectiveId);
  const dateRange =
    viewing ? `${viewing.startDate} → ${viewing.endDate}` : null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppShellStickyOffset />
      <header
        id="app-shell-header"
        className="border-b border-[var(--border)] bg-[var(--bg-elevated)] sticky top-0 z-40"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <Link href="/" className="font-mono text-lg font-semibold tracking-tight">
            <span className="text-[var(--accent)]">study</span>
            <span className="text-[var(--text-muted)]">_os</span>
          </Link>
          <AppNavLinks />
          <div className="ml-auto">
            <CycleHeaderControl
              cycleName={viewing?.name ?? null}
              dateRange={dateRange}
              isArchiveView={isArchiveView}
            />
          </div>
        </div>
      </header>
      {isArchiveView && viewing && (
        <ArchiveViewBanner
          archiveName={viewing.name}
          activeName={active?.name ?? null}
        />
      )}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
