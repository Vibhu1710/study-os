"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  formatTime12,
  joinTime12,
  splitTime12,
  type Time12Parts,
} from "@/lib/rhythm/effective-minutes";

const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => i * 5);

function clampParts(p: Time12Parts): Time12Parts {
  const hour12 = Math.min(12, Math.max(1, Math.round(p.hour12) || 12));
  const minute = Math.min(59, Math.max(0, Math.round(p.minute) || 0));
  return { hour12, minute, pm: p.pm };
}

export function RhythmTimePicker({
  value,
  onChange,
  label,
  disabled = false,
  unset = false,
  unsetLabel = "Not set",
  onUnsetChange,
  allowUnset = false,
}: {
  value: string;
  onChange: (hhmm: string) => void;
  label: string;
  disabled?: boolean;
  unset?: boolean;
  unsetLabel?: string;
  onUnsetChange?: (unset: boolean) => void;
  allowUnset?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const parts = splitTime12(value);

  const [draft, setDraft] = useState(parts);

  useEffect(() => {
    setDraft(splitTime12(value));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function applyParts(next: Time12Parts) {
    const c = clampParts(next);
    setDraft(c);
    onChange(joinTime12(c));
    onUnsetChange?.(false);
  }

  function commitDraftFields() {
    applyParts(draft);
  }

  const display = unset && allowUnset ? unsetLabel : formatTime12(value);

  return (
    <div ref={rootRef} className="relative">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={listId}
          disabled={disabled || (unset && allowUnset)}
          className={cn(
            "input flex min-w-0 flex-1 items-center justify-between gap-2 text-left font-mono text-xs",
            unset && allowUnset && "text-[var(--text-muted)]",
            disabled && "cursor-not-allowed opacity-60",
          )}
          onClick={() => {
            if (!disabled) setOpen((o) => !o);
          }}
        >
          <span className="truncate">{display}</span>
          <Clock className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        </button>
        {allowUnset && (
          <button
            type="button"
            className={cn(
              "btn shrink-0 px-2 text-[10px]",
              unset && "border-[var(--accent)]/50 text-[var(--accent)]",
            )}
            disabled={disabled}
            title="Mark end time as not set yet"
            onClick={() => onUnsetChange?.(!unset)}
          >
            {unset ? "Set" : "Later"}
          </button>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <input
          type="number"
          min={1}
          max={12}
          className="input w-12 py-1 text-center font-mono text-xs"
          value={draft.hour12}
          disabled={disabled || unset}
          aria-label={`${label} hour`}
          onChange={(e) =>
            setDraft((d) => ({ ...d, hour12: Number(e.target.value) }))
          }
          onBlur={commitDraftFields}
        />
        <span className="text-[var(--text-muted)]">:</span>
        <input
          type="number"
          min={0}
          max={59}
          className="input w-12 py-1 text-center font-mono text-xs"
          value={draft.minute}
          disabled={disabled || unset}
          aria-label={`${label} minute`}
          onChange={(e) =>
            setDraft((d) => ({ ...d, minute: Number(e.target.value) }))
          }
          onBlur={commitDraftFields}
        />
        <div className="inline-flex rounded-md border border-[var(--border)] p-0.5">
          {(
            [
              { pm: false, label: "AM" },
              { pm: true, label: "PM" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.label}
              type="button"
              disabled={disabled || unset}
              className={cn(
                "rounded px-2 py-0.5 font-mono text-[10px]",
                draft.pm === opt.pm
                  ? "bg-[var(--accent)] font-semibold text-[#0d1117]"
                  : "text-[var(--text-muted)]",
              )}
              onClick={() => applyParts({ ...draft, pm: opt.pm })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {open && !unset && (
        <div
          id={listId}
          role="dialog"
          aria-label={`Choose ${label}`}
          className="absolute left-0 top-full z-50 mt-1 w-[min(100%,16rem)] rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-xl shadow-black/40"
        >
          <p className="mb-2 font-mono text-[9px] uppercase text-[var(--text-muted)]">Hour</p>
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
              <button
                key={h}
                type="button"
                className={cn(
                  "rounded-md py-1.5 font-mono text-xs",
                  draft.hour12 === h
                    ? "bg-[var(--accent)] font-semibold text-[#0d1117]"
                    : "bg-[var(--bg-muted)] text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
                onClick={() => applyParts({ ...draft, hour12: h })}
              >
                {h}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-3 font-mono text-[9px] uppercase text-[var(--text-muted)]">
            Minute
          </p>
          <div className="grid grid-cols-4 gap-1">
            {MINUTE_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                className={cn(
                  "rounded-md py-1.5 font-mono text-xs",
                  draft.minute === m
                    ? "bg-[var(--accent)] font-semibold text-[#0d1117]"
                    : "bg-[var(--bg-muted)] text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
                onClick={() => applyParts({ ...draft, minute: m })}
              >
                {m.toString().padStart(2, "0")}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className={cn(
                "btn flex-1 text-xs",
                !draft.pm && "border-[var(--accent)]/40",
              )}
              onClick={() => applyParts({ ...draft, pm: false })}
            >
              AM
            </button>
            <button
              type="button"
              className={cn(
                "btn flex-1 text-xs",
                draft.pm && "border-[var(--accent)]/40",
              )}
              onClick={() => applyParts({ ...draft, pm: true })}
            >
              PM
            </button>
          </div>
          <button
            type="button"
            className="btn btn-primary mt-3 w-full text-xs"
            onClick={() => setOpen(false)}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
