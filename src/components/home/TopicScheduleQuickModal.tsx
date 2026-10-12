"use client";

import { useEffect, useState } from "react";
import { CompactPlanDateGrid } from "@/components/calendar/CompactPlanDateGrid";
import type { DayStat } from "@/components/calendar/ContributionCalendar";
import { Modal } from "@/components/ui/Modal";
import type { DateString } from "@/lib/dates";
import { canPlanOnDay, type PhaseBounds } from "@/lib/study-day";

export function TopicScheduleQuickModal({
  open,
  topicTitle,
  mode,
  currentDates,
  today,
  objectiveStart,
  objectiveEnd,
  phase,
  calendarDays,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  topicTitle: string;
  mode: "schedule" | "reschedule";
  currentDates: string[];
  today: DateString;
  objectiveStart: DateString;
  objectiveEnd: DateString;
  phase: PhaseBounds | null;
  calendarDays: Record<string, DayStat>;
  pending: boolean;
  onClose: () => void;
  onConfirm: (date: DateString) => void;
}) {
  const minDate =
    phase?.startDate && phase.startDate > today ? phase.startDate : today;
  const maxDate = phase?.endDate ?? objectiveEnd;

  const [pick, setPick] = useState<DateString | "">("");

  useEffect(() => {
    if (!open) return;
    const initial =
      mode === "reschedule" && currentDates.length > 0
        ? currentDates[0]
        : today >= minDate && today <= maxDate
          ? today
          : minDate;
    setPick(initial);
  }, [open, mode, currentDates, today, minDate, maxDate]);

  const description =
    mode === "reschedule" && currentDates.length > 0
      ? `“${topicTitle}” — now ${currentDates.map((d) => (d === today ? "today" : d)).join(", ")}. Pick a new day, then Save.`
      : `“${topicTitle}” — select a day in this phase, then Save.`;

  const initialMonth =
    mode === "reschedule" && currentDates.length > 0 ? currentDates[0] : today;

  const canSave =
    Boolean(pick) &&
    canPlanOnDay(pick, objectiveStart, objectiveEnd, phase) &&
    pick >= today &&
    !(
      mode === "reschedule" &&
      currentDates.length === 1 &&
      currentDates[0] === pick
    );

  return (
    <Modal
      open={open}
      title={mode === "schedule" ? "Schedule" : "Reschedule"}
      description={description}
      onClose={onClose}
    >
      {open && (
        <CompactPlanDateGrid
          days={calendarDays}
          today={today}
          objectiveStart={objectiveStart}
          objectiveEnd={objectiveEnd}
          phase={phase}
          topicAssignedDates={mode === "reschedule" ? currentDates : []}
          selectedDate={pick}
          initialMonth={initialMonth}
          onSelect={(date) => {
            if (pending) return;
            if (!canPlanOnDay(date, objectiveStart, objectiveEnd, phase) || date < today) {
              return;
            }
            setPick(date);
          }}
        />
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="btn text-xs" disabled={pending} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary text-xs disabled:opacity-40"
          disabled={pending || !canSave}
          onClick={() => pick && onConfirm(pick)}
        >
          {mode === "schedule" ? "Schedule" : "Reschedule"}
        </button>
      </div>
    </Modal>
  );
}
