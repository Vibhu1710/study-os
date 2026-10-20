"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { RhythmAnalogClock } from "@/components/rhythm/RhythmAnalogClock";
import { cn } from "@/lib/cn";
import {
  formatRhythmDuration,
  formatTime12,
  rhythmBreakMinutes,
  rhythmEffectiveMinutes,
} from "@/lib/rhythm/effective-minutes";
import type { RhythmSandglassConfig } from "@/lib/rhythm/effective-minutes";
import type { RhythmFormState } from "@/components/rhythm/RhythmSessionForm";

type EntryMode = "complete" | "partial";
type PartialEdge = "start" | "end";

export function RhythmSessionModal({
  open,
  date,
  readOnly,
  initial,
  sandglass,
  pending,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  date: string;
  readOnly: boolean;
  initial: RhythmFormState | null;
  sandglass: RhythmSandglassConfig;
  pending: boolean;
  onClose: () => void;
  onSave: (state: RhythmFormState) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState<RhythmFormState>(
    initial ?? {
      startTime: "09:00",
      endTime: "17:00",
      startsWithOddCycle: true,
      fullCycleCount: 0,
      startPartialTenths: 0,
      endPartialTenths: 0,
      continuedFromPreviousDay: false,
    },
  );
  const [entryMode, setEntryMode] = useState<EntryMode>("complete");
  const [partialEdge, setPartialEdge] = useState<PartialEdge>("end");

  useEffect(() => {
    if (!open || !initial) return;
    setForm(initial);
    const hasPartial =
      initial.startPartialTenths > 0 || initial.endPartialTenths > 0;
    setEntryMode(hasPartial ? "partial" : "complete");
    if (initial.startPartialTenths > 0) setPartialEdge("start");
    else if (initial.endPartialTenths > 0) setPartialEdge("end");
  }, [open, initial, date]);

  useEffect(() => {
    if (entryMode === "complete") {
      setForm((f) => ({ ...f, startPartialTenths: 0, endPartialTenths: 0 }));
    }
  }, [entryMode]);

  const metrics = useMemo(() => {
    const effective = rhythmEffectiveMinutes(form, sandglass);
    const breakMin = rhythmBreakMinutes(form, sandglass);
    return { effective, breakMin };
  }, [form, sandglass]);

  const validation =
    form.endTime <= form.startTime
      ? "End time must be after start time."
      : metrics.breakMin < 0
        ? "Effective study exceeds session span — check times or cycles."
        : null;

  const partialValue =
    partialEdge === "start" ? form.startPartialTenths : form.endPartialTenths;

  return (
    <Modal
      open={open}
      wide="xl"
      title={`Session · ${date}`}
      description={`Odd ${sandglass.oddMinutes}m · Even ${sandglass.evenMinutes}m per flip`}
      onClose={onClose}
    >
      <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5">
        {(
          [
            { id: "complete" as const, label: "Complete cycles" },
            { id: "partial" as const, label: "Partial flip" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={readOnly || pending}
            className={cn(
              "rounded-md px-3 py-1.5 font-mono text-[10px]",
              entryMode === t.id
                ? "bg-[var(--accent)] font-semibold text-[#0d1117]"
                : "text-[var(--text-muted)]",
            )}
            onClick={() => setEntryMode(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-6 sm:gap-10">
        <RhythmAnalogClock
          time={form.startTime}
          size={112}
          label="Clock in"
          sublabel={formatTime12(form.startTime)}
          interactive={!readOnly && !pending}
          onTimeChange={(t) => setForm((f) => ({ ...f, startTime: t }))}
        />
        <RhythmAnalogClock
          time={form.endTime}
          size={112}
          label="Clock out"
          sublabel={formatTime12(form.endTime)}
          interactive={!readOnly && !pending}
          onTimeChange={(t) => setForm((f) => ({ ...f, endTime: t }))}
        />
      </div>
      <p className="mt-2 text-center font-mono text-[9px] text-[var(--text-muted)]">
        Tap outer ring for minutes · inner for hour
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">First flip</span>
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
                disabled={readOnly || pending}
                className={cn(
                  "rounded px-2.5 py-1 font-mono text-[10px]",
                  form.startsWithOddCycle === opt.id
                    ? "bg-[var(--accent)] font-semibold text-[#0d1117]"
                    : "text-[var(--text-muted)]",
                )}
                onClick={() => setForm((f) => ({ ...f, startsWithOddCycle: opt.id }))}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {form.continuedFromPreviousDay && (
            <span className="text-[10px] text-[var(--accent)]">↩ yesterday</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">Full flips</span>
          <button
            type="button"
            className="btn px-2 py-0.5 text-xs"
            disabled={readOnly || pending || form.fullCycleCount <= 0}
            onClick={() =>
              setForm((f) => ({ ...f, fullCycleCount: Math.max(0, f.fullCycleCount - 1) }))
            }
          >
            −
          </button>
          <span className="min-w-[2rem] text-center font-mono text-lg font-semibold">
            {form.fullCycleCount}
          </span>
          <button
            type="button"
            className="btn px-2 py-0.5 text-xs"
            disabled={readOnly || pending}
            onClick={() => setForm((f) => ({ ...f, fullCycleCount: f.fullCycleCount + 1 }))}
          >
            +
          </button>
        </div>
      </div>

      {entryMode === "partial" && (
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-muted)]/30 p-3">
          <div className="mb-2 inline-flex rounded-md border border-[var(--border)] p-0.5">
            {(
              [
                { id: "start" as const, label: "Start carry" },
                { id: "end" as const, label: "End partial" },
              ] as const
            ).map((e) => (
              <button
                key={e.id}
                type="button"
                disabled={readOnly || pending}
                className={cn(
                  "rounded px-2 py-0.5 font-mono text-[10px]",
                  partialEdge === e.id
                    ? "bg-[var(--bg-elevated)] font-medium ring-1 ring-[var(--border)]"
                    : "text-[var(--text-muted)]",
                )}
                onClick={() => {
                  setPartialEdge(e.id);
                  if (e.id === "start") {
                    setForm((f) => ({ ...f, endPartialTenths: 0 }));
                  } else {
                    setForm((f) => ({ ...f, startPartialTenths: 0 }));
                  }
                }}
              >
                {e.label}
              </button>
            ))}
          </div>
          <label className="block text-xs text-[var(--text-muted)]">
            Sand {partialEdge === "end" ? "moved" : "remaining"} ({partialValue * 10}%)
            <input
              type="range"
              min={1}
              max={9}
              step={1}
              className="mt-2 w-full accent-[var(--accent)]"
              value={Math.max(1, partialValue)}
              disabled={readOnly || pending}
              onChange={(ev) => {
                const v = Number(ev.target.value);
                setForm((f) =>
                  partialEdge === "start"
                    ? { ...f, startPartialTenths: v, endPartialTenths: 0 }
                    : { ...f, endPartialTenths: v, startPartialTenths: 0 },
                );
              }}
            />
          </label>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-8 border-t border-[var(--border)] pt-4">
        <div className="text-center">
          <p className="font-mono text-[9px] uppercase text-[var(--text-muted)]">Effective</p>
          <p className="text-xl font-semibold text-[var(--accent)]">
            {formatRhythmDuration(metrics.effective)}
          </p>
        </div>
        <div className="text-center">
          <p className="font-mono text-[9px] uppercase text-[var(--text-muted)]">Break</p>
          <p className="text-xl font-semibold">{formatRhythmDuration(metrics.breakMin)}</p>
        </div>
      </div>

      {validation && <p className="mt-2 text-center text-xs text-[var(--danger)]">{validation}</p>}

      {!readOnly && (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {initial && (
            <button
              type="button"
              className="btn text-xs text-[var(--danger)]"
              disabled={pending}
              onClick={onDelete}
            >
              Clear day
            </button>
          )}
          <button type="button" className="btn text-xs" disabled={pending} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary text-xs"
            disabled={pending || Boolean(validation)}
            onClick={() => {
              onSave(form);
              onClose();
            }}
          >
            {pending ? "Saving…" : "Save session"}
          </button>
        </div>
      )}
    </Modal>
  );
}
