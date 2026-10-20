"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { quickSetTodayCompleteCycles } from "@/lib/actions/rhythm";
import { formatRhythmDuration } from "@/lib/rhythm/effective-minutes";
import {
  RHYTHM_TODAY_UPDATED_EVENT,
  type RhythmTodayUpdatedDetail,
} from "@/lib/rhythm/shortcut-events";
import { useCompletionDates } from "@/lib/completion-dates-context";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

type Toast = {
  id: number;
  message: string;
  error?: boolean;
};

export function RhythmCycleShortcut() {
  const { objectiveId } = useCompletionDates();
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pendingRef = useRef(false);
  const toastId = useRef(0);

  function pushToast(message: string, error = false) {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, error }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3200);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return;
      if (isEditableTarget(e.target)) return;

      const m = e.code.match(/^Digit([1-9])$/);
      if (!m) return;

      e.preventDefault();
      if (!objectiveId) {
        pushToast("No study cycle — create one in Settings first.", true);
        return;
      }
      if (pendingRef.current) return;

      const completeCount = Number(m[1]);
      pendingRef.current = true;
      void quickSetTodayCompleteCycles(objectiveId, completeCount)
        .then((result) => {
          const detail: RhythmTodayUpdatedDetail = {
            date: result.date,
            completeCount: result.completeCount,
            effectiveMinutes: result.effectiveMinutes,
          };
          window.dispatchEvent(
            new CustomEvent(RHYTHM_TODAY_UPDATED_EVENT, { detail }),
          );
          router.refresh();
          pushToast(
            `Today · ${result.completeCount} complete cycle${result.completeCount === 1 ? "" : "s"} · ${formatRhythmDuration(result.effectiveMinutes)} effective`,
          );
        })
        .catch((err: unknown) => {
          const msg =
            err instanceof Error ? err.message : "Could not update momentum.";
          pushToast(msg, true);
        })
        .finally(() => {
          pendingRef.current = false;
        });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [objectiveId, router]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-6 left-1/2 z-[300] flex max-w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={
            t.error
              ? "rounded-lg border border-[var(--danger)]/40 bg-[var(--bg-elevated)] px-4 py-2.5 font-mono text-xs text-[var(--danger)] shadow-lg"
              : "rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 font-mono text-xs text-[var(--text)] shadow-lg"
          }
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
