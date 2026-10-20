"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  formatRhythmDuration,
  formatTime12,
  rhythmBreakMinutes,
  rhythmEffectiveMinutes,
} from "@/lib/rhythm/effective-minutes";
import type { RhythmSandglassConfig } from "@/lib/rhythm/effective-minutes";

export type RhythmFormState = {
  startTime: string;
  endTime: string;
  startsWithOddCycle: boolean;
  fullCycleCount: number;
  startPartialTenths: number;
  endPartialTenths: number;
  continuedFromPreviousDay: boolean;
};

export function RhythmSessionForm({
  date,
  readOnly,
  initial,
  sandglass,
  pending,
  onSave,
  onDelete,
}: {
  date: string;
  readOnly: boolean;
  initial: RhythmFormState | null;
  sandglass: RhythmSandglassConfig;
  pending: boolean;
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

  useEffect(() => {
    if (initial) setForm(initial);
  }, [date, initial]);

  const metrics = useMemo(() => {
    const effective = rhythmEffectiveMinutes(form, sandglass);
    const breakMin = rhythmBreakMinutes(
      { ...form, startTime: form.startTime, endTime: form.endTime },
      sandglass,
    );
    return { effective, breakMin };
  }, [form, sandglass]);

  const validation =
    form.endTime <= form.startTime
      ? "End time must be after start time."
      : metrics.breakMin < 0
        ? "Effective study exceeds session span — check times or cycles."
        : null;

  return (
    <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--bg-muted)]/20 p-4">
      <div>
        <h3 className="font-mono text-[10px] uppercase tracking-wide text-[var(--accent)]">
          Session · {date}
        </h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Odd flip ≈ {sandglass.oddMinutes}m · Even flip ≈ {sandglass.evenMinutes}m (Settings)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs">
          <span className="text-[var(--text-muted)]">Start</span>
          <input
            type="time"
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 font-mono text-sm"
            value={form.startTime}
            disabled={readOnly || pending}
            onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
          />
          <span className="mt-0.5 block font-mono text-[9px] text-[var(--text-muted)]">
            {formatTime12(form.startTime)}
          </span>
        </label>
        <label className="block text-xs">
          <span className="text-[var(--text-muted)]">End</span>
          <input
            type="time"
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 font-mono text-sm"
            value={form.endTime}
            disabled={readOnly || pending}
            onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
          />
          <span className="mt-0.5 block font-mono text-[9px] text-[var(--text-muted)]">
            {formatTime12(form.endTime)}
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
          <span className="text-[10px] text-[var(--accent)]">Continuing yesterday</span>
        )}
      </div>

      <label className="block text-xs">
        <span className="text-[var(--text-muted)]">Complete sandglass flips (middle)</span>
        <div className="mt-1 flex items-center gap-2">
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
          <span className="min-w-[2rem] text-center font-mono text-sm">
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
      </label>

      <PartialSlider
        label="Start partial (remaining sand, tenths)"
        value={form.startPartialTenths}
        disabled={readOnly || pending}
        onChange={(v) => setForm((f) => ({ ...f, startPartialTenths: v }))}
      />
      <PartialSlider
        label="End partial (sand moved, tenths)"
        value={form.endPartialTenths}
        disabled={readOnly || pending}
        onChange={(v) => setForm((f) => ({ ...f, endPartialTenths: v }))}
      />

      <div className="grid grid-cols-2 gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-xs">
        <div>
          <p className="text-[10px] text-[var(--text-muted)]">Effective</p>
          <p className="text-lg font-semibold text-[var(--accent)]">
            {formatRhythmDuration(metrics.effective)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[var(--text-muted)]">Est. break</p>
          <p className="text-lg font-semibold">{formatRhythmDuration(metrics.breakMin)}</p>
        </div>
      </div>

      {validation && (
        <p className="text-xs text-[var(--danger)]">{validation}</p>
      )}

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary text-xs"
            disabled={pending || Boolean(validation)}
            onClick={() => onSave(form)}
          >
            Save session
          </button>
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
        </div>
      )}
    </div>
  );
}

function PartialSlider({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-xs">
      <span className="text-[var(--text-muted)]">
        {label} {value > 0 ? `(${value * 10}%)` : "— none"}
      </span>
      <input
        type="range"
        min={0}
        max={9}
        step={1}
        className="mt-2 w-full accent-[var(--accent)]"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="mt-0.5 flex justify-between font-mono text-[9px] text-[var(--text-muted)]">
        <span>0</span>
        <span>50%</span>
        <span>90%</span>
      </div>
    </label>
  );
}
