"use client";

import { useState } from "react";
import { PhaseDashboard } from "@/components/dashboard/PhaseDashboard";
import type {
  DashboardScope,
  PhaseDashboardPayload,
} from "@/lib/actions/phase-dashboard";
import { cn } from "@/lib/cn";

const CHART_WINDOW: Record<DashboardScope, number> = {
  phase: 12,
  cycle: 28,
};

export function DashboardWorkspace({
  objectiveId,
  cycleData,
  phaseData,
  phaseToggleEnabled,
  defaultScope,
}: {
  objectiveId: string;
  cycleData: PhaseDashboardPayload | null;
  phaseData: PhaseDashboardPayload | null;
  phaseToggleEnabled: boolean;
  defaultScope: DashboardScope;
}) {
  const [scope, setScope] = useState<DashboardScope>(() =>
    phaseToggleEnabled && defaultScope === "phase" ? "phase" : "cycle",
  );

  const effectiveScope: DashboardScope =
    scope === "phase" && phaseToggleEnabled ? "phase" : "cycle";
  const data = effectiveScope === "phase" ? phaseData : cycleData;

  if (!data) {
    return (
      <p className="text-sm text-[var(--text-muted)]">Dashboard data unavailable.</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-[var(--text-muted)]">View</span>
        <div
          className="inline-flex rounded-md border border-[var(--border)] p-0.5"
          role="group"
          aria-label="Dashboard scope"
        >
          <button
            type="button"
            disabled={!phaseToggleEnabled}
            title={
              phaseToggleEnabled
                ? "Current phase only"
                : "Phase view requires an active phase on a live cycle"
            }
            className={cn(
              "rounded px-3 py-1 font-mono text-xs transition-colors",
              effectiveScope === "phase"
                ? "bg-[var(--accent)] text-[var(--bg)]"
                : "text-[var(--text-muted)]",
              !phaseToggleEnabled && "cursor-not-allowed opacity-45",
            )}
            onClick={() => phaseToggleEnabled && setScope("phase")}
          >
            Phase
          </button>
          <button
            type="button"
            className={cn(
              "rounded px-3 py-1 font-mono text-xs transition-colors",
              effectiveScope === "cycle"
                ? "bg-[var(--accent)] text-[var(--bg)]"
                : "text-[var(--text-muted)]",
            )}
            onClick={() => setScope("cycle")}
          >
            Cycle
          </button>
        </div>
      </div>
      <PhaseDashboard
        key={effectiveScope}
        objectiveId={objectiveId}
        data={data}
        chartWindow={CHART_WINDOW[effectiveScope]}
      />
    </div>
  );
}
