"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Modal } from "@/components/ui/Modal";
import {
  nowHhmm,
  RhythmMasterTimePanel,
} from "@/components/rhythm/RhythmMasterTimePanel";
import { RhythmSandglassPartial } from "@/components/rhythm/RhythmSandglassPartial";
import { cn } from "@/lib/cn";
import {
  isSameDayClockOutAfterStart,
  type RhythmSandglassConfig,
} from "@/lib/rhythm/effective-minutes";
import {
  buildDayFlipEntries,
  clampPartialSliderTenth,
  parseDayFlipStructure,
  rhythmStudyMinutesBreakdown,
  type RhythmDayState,
} from "@/lib/rhythm/entries";

type PartialTab = "start" | "end";

/** Unconfirmed clock fields are drafts — show current local time when opening the modal. */
function dayStateForModalOpen(day: RhythmDayState): RhythmDayState {
  const now = nowHhmm();
  let next: RhythmDayState = {
    ...day,
    startTime: day.startTimeConfirmed ? day.startTime : now,
    endTime: day.endTimeConfirmed ? day.endTime : now,
  };
  if (
    next.startTimeConfirmed &&
    next.endTimeConfirmed &&
    !isSameDayClockOutAfterStart(next.startTime, next.endTime)
  ) {
    next = { ...next, endTimeConfirmed: false, endTime: now };
  }
  return next;
}

export function RhythmSessionMasterModal({
  open,
  date,
  today,
  readOnly,
  day,
  sandglass,
  pending,
  carryRemainingTenths,
  onClose,
  onSave,
  onDelete,
  saved,
}: {
  open: boolean;
  date: string;
  today: string;
  readOnly: boolean;
  day: RhythmDayState;
  sandglass: RhythmSandglassConfig;
  carryRemainingTenths: number;
  pending: boolean;
  onClose: () => void;
  onSave: (day: RhythmDayState) => void;
  onDelete?: () => void;
  saved: boolean;
}) {
  const [state, setState] = useState(day);
  const [completeCount, setCompleteCount] = useState(0);
  const [startPartialTenths, setStartPartialTenths] = useState<number | null>(null);
  const [endPartialLowerTenths, setEndPartialLowerTenths] = useState<number | null>(null);
  const [partialTab, setPartialTab] = useState<PartialTab>("start");
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setClearConfirmOpen(false);
      return;
    }
    setState(dayStateForModalOpen(day));
    const parsed = parseDayFlipStructure(day.entries);
    setCompleteCount(parsed.completeCount);
    const startRaw =
      parsed.startPartialTenths ??
      (day.entries.length === 0 && carryRemainingTenths > 0
        ? carryRemainingTenths
        : null);
    const start =
      startRaw != null ? clampPartialSliderTenth(startRaw) : null;
    setStartPartialTenths(start);
    setEndPartialLowerTenths(parsed.endPartialLowerTenths);
    setPartialTab("start");
  }, [open, day, carryRemainingTenths]);

  const entries = useMemo(
    () =>
      buildDayFlipEntries(
        { startPartialTenths, completeCount, endPartialLowerTenths },
        day.entries,
      ),
    [startPartialTenths, completeCount, endPartialLowerTenths, day.entries],
  );

  const endEnabled = state.startTimeConfirmed;
  const clockOutValid = isSameDayClockOutAfterStart(
    state.startTime,
    state.endTime,
  );

  const minutesBreakdown = useMemo(
    () =>
      rhythmStudyMinutesBreakdown(
        state.startsWithOddCycle,
        entries,
        sandglass,
      ),
    [state.startsWithOddCycle, entries, sandglass],
  );

  function commitSave() {
    onSave({ ...state, entries });
    onClose();
  }

  return (
    <>
    <Modal
      open={open}
      wide="xl"
      title={`Configure day · ${date === today ? "Today" : date}`}
      onClose={onClose}
    >
      <div className="flex flex-wrap gap-3">
        <RhythmMasterTimePanel
          label="Clock in"
          value={state.startTime}
          confirmed={state.startTimeConfirmed}
          disabled={readOnly || pending}
          onChange={(t) =>
            setState((s) => {
              const next = { ...s, startTime: t };
              if (
                s.endTimeConfirmed &&
                !isSameDayClockOutAfterStart(t, s.endTime)
              ) {
                return { ...next, endTimeConfirmed: false };
              }
              return next;
            })
          }
          onConfirm={() =>
            setState((s) => {
              const next = { ...s, startTimeConfirmed: true };
              if (
                next.endTimeConfirmed &&
                !isSameDayClockOutAfterStart(next.startTime, next.endTime)
              ) {
                return { ...next, endTimeConfirmed: false };
              }
              return next;
            })
          }
        />
        <RhythmMasterTimePanel
          label="Clock out"
          value={state.endTime}
          confirmed={state.endTimeConfirmed}
          placeholder={!state.endTimeConfirmed && endEnabled}
          disabled={readOnly || pending || !endEnabled}
          confirmDisabled={!clockOutValid}
          confirmHint={
            endEnabled && !clockOutValid
              ? "Must be after clock-in on this day"
              : undefined
          }
          onChange={(t) => setState((s) => ({ ...s, endTime: t }))}
          onConfirm={() => {
            if (!clockOutValid) return;
            setState((s) => ({ ...s, endTimeConfirmed: true }));
          }}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span className="text-[var(--text-muted)]">
          Day started{" "}
          <span className="font-mono font-semibold text-[var(--accent)]">
            {state.startsWithOddCycle ? "Odd" : "Even"}
          </span>
        </span>
        {!readOnly && (
          <div className="inline-flex rounded-md border border-[var(--border)] p-0.5">
            {(
              [
                { id: true, label: "Odd" },
                { id: false, label: "Even" },
              ] as const
            ).map((opt) => (
              <button
                key={String(opt.id)}
                type="button"
                disabled={pending}
                className={cn(
                  "rounded px-2.5 py-1 font-mono text-[10px]",
                  state.startsWithOddCycle === opt.id
                    ? "bg-[var(--accent)] font-semibold text-[#0d1117]"
                    : "text-[var(--text-muted)]",
                )}
                onClick={() => setState((s) => ({ ...s, startsWithOddCycle: opt.id }))}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        {state.continuedFromPreviousDay && (
          <span className="font-mono text-[10px] text-[var(--accent)]">↩ carry from yesterday</span>
        )}
      </div>

      <section className="mt-5 rounded-lg border border-[var(--border)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
          Complete cycles
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Full sandglass flips only — parity follows from how the day started.
        </p>
        <div className="mt-3 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn py-1 font-mono text-[10px]"
              disabled={readOnly || pending || completeCount <= 0}
              onClick={() => setCompleteCount((c) => Math.max(0, c - 2))}
            >
              -2
            </button>
            <button
              type="button"
              className="btn px-2 py-0.5"
              disabled={readOnly || pending || completeCount <= 0}
              onClick={() => setCompleteCount((c) => Math.max(0, c - 1))}
            >
              <Minus className="h-4 w-4" aria-hidden />
            </button>
            <span className="min-w-[2rem] text-center font-mono text-xl font-semibold tabular-nums">
              {completeCount}
            </span>
            <button
              type="button"
              className="btn px-2 py-0.5"
              disabled={readOnly || pending}
              onClick={() => setCompleteCount((c) => c + 1)}
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                disabled={readOnly || pending}
                className="btn py-1 font-mono text-[10px]"
                onClick={() => setCompleteCount((c) => c + n)}
              >
                +{n}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-[var(--border)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            Partials
          </p>
          <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5">
            {(
              [
                { id: "start" as const, label: "Start" },
                { id: "end" as const, label: "End" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  "rounded-md px-3 py-1 font-mono text-[10px]",
                  partialTab === tab.id
                    ? "bg-[var(--accent)] font-semibold text-[#0d1117]"
                    : "text-[var(--text-muted)]",
                )}
                onClick={() => setPartialTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Partials apply only at the beginning or end of the session, not between complete flips.
        </p>

        {partialTab === "start" ? (
          <div className="mt-4 space-y-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="rounded border-[var(--border)]"
                checked={startPartialTenths != null}
                disabled={readOnly || pending}
                onChange={(e) =>
                  setStartPartialTenths(
                    e.target.checked
                      ? carryRemainingTenths > 0
                        ? carryRemainingTenths
                        : 5
                      : null,
                  )
                }
              />
              Start partial (sand left in upper bulb)
            </label>
            {startPartialTenths != null && (
              <RhythmSandglassPartial
                variant="start"
                tenths={startPartialTenths}
                contributedMinutes={minutesBreakdown.startPartialMinutes}
                disabled={readOnly || pending}
                onChange={(t) => setStartPartialTenths(t)}
              />
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="rounded border-[var(--border)]"
                checked={endPartialLowerTenths != null}
                disabled={readOnly || pending}
                onChange={(e) => setEndPartialLowerTenths(e.target.checked ? 5 : null)}
              />
              End partial (sand in lower bulb when you stopped)
            </label>
            {endPartialLowerTenths != null && (
              <RhythmSandglassPartial
                variant="end"
                tenths={endPartialLowerTenths}
                contributedMinutes={minutesBreakdown.endPartialMinutes}
                disabled={readOnly || pending}
                onChange={(t) => setEndPartialLowerTenths(t)}
              />
            )}
          </div>
        )}
      </section>

      {readOnly ? (
        <div className="mt-5 flex justify-end">
          <button type="button" className="btn text-xs" onClick={onClose}>
            Close
          </button>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <div>
            {saved && onDelete && (
              <button
                type="button"
                className="btn text-xs text-[var(--danger)]"
                disabled={pending}
                onClick={() => setClearConfirmOpen(true)}
              >
                Clear day
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn text-xs" disabled={pending} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary text-xs"
              disabled={
                pending ||
                (state.endTimeConfirmed &&
                  state.startTimeConfirmed &&
                  !clockOutValid)
              }
              onClick={commitSave}
            >
              Save day
            </button>
          </div>
        </div>
      )}
    </Modal>

    <ConfirmModal
      open={clearConfirmOpen}
      title="Clear momentum log?"
      description={`Remove all cycles, partials, and clock times for ${date}? This cannot be undone.`}
      confirmLabel="Clear day"
      pending={pending}
      onClose={() => setClearConfirmOpen(false)}
      onConfirm={() => {
        onDelete?.();
        setClearConfirmOpen(false);
        onClose();
      }}
    />
    </>
  );
}
