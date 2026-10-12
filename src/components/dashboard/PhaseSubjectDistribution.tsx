"use client";

import type { SubjectProgress } from "@/lib/actions/analytics";
import { cn } from "@/lib/cn";

function fmtWt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** Integer percents of phase weight that sum to 100. */
function phaseSharePercents(weights: number[]): number[] {
  const total = weights.reduce((s, n) => s + n, 0);
  if (total <= 0) return weights.map(() => 0);
  const raw = weights.map((n) => (n / total) * 100);
  const floors = raw.map((n) => Math.floor(n));
  const order = raw
    .map((n, i) => ({ i, frac: n - Math.floor(n) }))
    .sort((a, b) => b.frac - a.frac || b.i - a.i);
  const left = Math.min(
    Math.max(0, 100 - floors.reduce((s, n) => s + n, 0)),
    order.length,
  );
  const out = [...floors];
  for (let k = 0; k < left; k++) out[order[k].i] += 1;
  return out;
}

export function PhaseSubjectDistribution({
  subjects,
  selectedSubjectId,
  onSelect,
}: {
  subjects: SubjectProgress[];
  selectedSubjectId: string | null;
  onSelect: (subjectId: string) => void;
}) {
  const ordered = [...subjects].sort((a, b) => b.totalWeight - a.totalWeight);
  const shares = phaseSharePercents(ordered.map((s) => s.totalWeight));

  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {ordered.map((s, i) => {
          const donePct =
            s.totalWeight > 0
              ? Math.min(100, (s.completedWeight / s.totalWeight) * 100)
              : 0;
          const selected = selectedSubjectId === s.subjectId;
          return (
            <button
              key={s.subjectId}
              type="button"
              title={s.name}
              className={cn(
                "relative h-full overflow-hidden rounded-sm",
                selected && "outline outline-1 outline-[var(--text)]",
              )}
              style={{
                width: `${Math.max(shares[i], 0)}%`,
                background: `color-mix(in srgb, ${s.color} 32%, transparent)`,
              }}
              onClick={() => onSelect(s.subjectId)}
            >
              <span
                className="absolute inset-y-0 left-0"
                style={{ width: `${donePct}%`, background: s.color }}
              />
            </button>
          );
        })}
      </div>
      <ul className="mt-3 space-y-1">
        {ordered.map((s, i) => {
          const selected = selectedSubjectId === s.subjectId;
          return (
            <li key={s.subjectId}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-baseline justify-between gap-3 rounded-md px-1.5 py-1 text-left",
                  "hover:bg-[var(--bg-muted)]/50",
                  selected && "bg-[var(--bg-muted)]",
                )}
                onClick={() => onSelect(s.subjectId)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: s.color }}
                  />
                  <span className="truncate text-sm">{s.name}</span>
                </span>
                <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
                  {fmtWt(s.completedWeight)}/{fmtWt(s.totalWeight)} wt · {shares[i]}% of phase
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
