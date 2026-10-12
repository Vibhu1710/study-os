"use client";

import { useState } from "react";
import type { PhaseSubjectPaceRow } from "@/lib/actions/phase-dashboard";
import { cn } from "@/lib/cn";

function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function sittingsToGo(n: number): string {
  return `${fmt(n)} sitting${n === 1 ? "" : "s"} to go`;
}

function SittingLine({ row }: { row: PhaseSubjectPaceRow }) {
  if (row.sittingWt == null || row.sittingsLeft == null) {
    return <p className="text-[var(--text-muted)]">No sitting yet</p>;
  }
  return (
    <p>
      {fmt(row.sittingWt)} wt/sitting · {sittingsToGo(row.sittingsLeft)}
    </p>
  );
}

export function PhaseSubjectPace({
  rows,
  selectedSubjectId,
  onSelect,
}: {
  rows: PhaseSubjectPaceRow[];
  selectedSubjectId: string | null;
  onSelect: (subjectId: string) => void;
}) {
  return (
    <ul className="space-y-1">
        {rows.map((row) => {
          const selected = selectedSubjectId === row.subjectId;
          return (
            <li key={row.subjectId}>
              <button
                type="button"
                onClick={() => onSelect(row.subjectId)}
                className={cn(
                  "w-full rounded-md px-1.5 py-1.5 text-left",
                  "hover:bg-[var(--bg-muted)]/50",
                  selected && "bg-[var(--bg-muted)]",
                )}
              >
                <div className="mb-0.5 flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: row.color }}
                    />
                    <span className="truncate text-sm">{row.name}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
                    {fmt(row.remainingWeight)} wt left
                  </span>
                </div>
                <div className="pl-4 font-mono text-[10px] text-[var(--text-muted)]">
                  <SittingLine row={row} />
                </div>
              </button>
            </li>
          );
        })}
    </ul>
  );
}

function InfoTip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ right: number; top: number } | null>(null);

  function show(el: HTMLButtonElement) {
    const rect = el.getBoundingClientRect();
    setPos({ right: window.innerWidth - rect.right, top: rect.bottom + 6 });
  }

  return (
    <>
      <button
        type="button"
        aria-label={text}
        className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-[var(--border)] font-mono text-[8px] leading-none text-[var(--text-muted)]"
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={() => setPos(null)}
        onFocus={(e) => show(e.currentTarget)}
        onBlur={() => setPos(null)}
      >
        i
      </button>
      {pos ? (
        <span
          className="pointer-events-none fixed z-50 w-56 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-left font-sans text-[10px] leading-snug text-[var(--text-muted)] shadow-lg"
          style={{ right: pos.right, top: pos.top }}
        >
          {text}
        </span>
      ) : null}
    </>
  );
}

function Metric({
  label,
  value,
  tip,
  valueClassName,
}: {
  label: string;
  value: string;
  tip: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="flex min-w-0 items-center gap-3 text-[var(--text-muted)]">
        {label}
        <InfoTip text={tip} />
      </span>
      <span className={cn("shrink-0 text-right text-[var(--text)]", valueClassName)}>
        {value}
      </span>
    </div>
  );
}

export function PhaseSubjectPaceView({
  row,
  ready,
}: {
  row: PhaseSubjectPaceRow;
  ready: boolean;
}) {
  const sittingTip =
    row.sittingDays > 0
      ? `Average weight on the last ${row.sittingDays} day${row.sittingDays === 1 ? "" : "s"} you logged this subject, at most 5. A day counts when this subject has any log.`
      : "Average weight on the days you log this subject, using the last 5 such days. A day counts when this subject has any log.";

  return (
    <div className="space-y-4 text-sm">
      <p className="text-lg font-medium">
        <span
          className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
          style={{ background: row.color }}
        />
        {row.name}
      </p>
      <div className="space-y-4 font-mono text-xs">
        <Metric
          label="Weight left"
          value={`${fmt(row.remainingWeight)} wt`}
          tip="Phase weight for this subject that is not logged yet."
        />
        <Metric
          label="Sitting pace"
          value={
            row.sittingWt != null ? `${fmt(row.sittingWt)} wt/sitting` : "No sitting yet"
          }
          tip={sittingTip}
        />
        <Metric
          label="Sittings to go"
          value={row.sittingsLeft != null ? fmt(row.sittingsLeft) : "—"}
          tip="Weight left ÷ sitting pace. How many more sittings of that size finish what is left. Not calendar days."
        />
        <Metric
          label="Share of logs"
          value={
            ready && row.attentionPercent != null
              ? `${row.attentionPercent}% of logs · ${row.shareOfRemainingPercent}% of what's left`
              : "not yet calculated"
          }
          tip="Share of all weight logged in the phase, next to this subject's share of weight still left. Shown after 4 days in the phase."
        />
        <Metric
          label="Past the phase"
          value={
            ready && row.unfinishedAtPhaseEnd != null
              ? row.unfinishedAtPhaseEnd > 0
                ? `~${fmt(row.unfinishedAtPhaseEnd)} wt`
                : "clears"
              : "not yet calculated"
          }
          valueClassName={
            ready && row.unfinishedAtPhaseEnd != null
              ? row.unfinishedAtPhaseEnd > 0
                ? "text-[var(--accent-amber)]"
                : "text-[var(--accent-green)]"
              : undefined
          }
          tip="Weight still open when the phase ends if this daily rate continues. Rate is weight logged so far ÷ phase days elapsed, including days you skip this subject. Shown after 4 days."
        />
      </div>
    </div>
  );
}
