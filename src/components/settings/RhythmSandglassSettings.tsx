"use client";

import { useState, useTransition } from "react";
import { saveRhythmGlobalConfig } from "@/lib/actions/rhythm";
import { cn } from "@/lib/cn";

export function RhythmSandglassCompact({
  oddMinutes,
  evenMinutes,
  className,
}: {
  oddMinutes: number;
  evenMinutes: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [odd, setOdd] = useState(String(oddMinutes));
  const [even, setEven] = useState(String(evenMinutes));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        className="card w-full min-w-[200px] max-w-[240px] p-3 text-left transition-colors hover:border-[var(--accent)]/40"
        onClick={() => setOpen((v) => !v)}
      >
        <p className="font-mono text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
          Sandglass
        </p>
        <p className="mt-1 text-sm font-medium">Momentum timing</p>
        <p className="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">
          Odd {oddMinutes}m · Even {evenMinutes}m
        </p>
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[150] cursor-default bg-black/40"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-[160] mt-2 w-[min(100vw-2rem,260px)] rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-xl">
            <p className="text-xs text-[var(--text-muted)]">
              Global flip lengths. Current cycle recalculates; archived cycles stay frozen.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-[10px] text-[var(--text-muted)]">
                Odd (m)
                <input
                  type="number"
                  min={1}
                  max={120}
                  step={0.5}
                  className="input mt-0.5 py-1 font-mono text-xs"
                  value={odd}
                  onChange={(e) => setOdd(e.target.value)}
                />
              </label>
              <label className="text-[10px] text-[var(--text-muted)]">
                Even (m)
                <input
                  type="number"
                  min={1}
                  max={120}
                  step={0.5}
                  className="input mt-0.5 py-1 font-mono text-xs"
                  value={even}
                  onChange={(e) => setEven(e.target.value)}
                />
              </label>
            </div>
            {error && <p className="mt-2 text-[10px] text-[var(--danger)]">{error}</p>}
            <button
              type="button"
              className="btn btn-primary mt-3 w-full text-xs"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    await saveRhythmGlobalConfig(Number(odd), Number(even));
                    setOpen(false);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not save");
                  }
                });
              }}
            >
              Save
            </button>
          </div>
        </>
      )}
    </div>
  );
}
