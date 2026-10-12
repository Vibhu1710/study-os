"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { CompactPlanDateGrid } from "@/components/calendar/CompactPlanDateGrid";
import type { DayStat } from "@/components/calendar/ContributionCalendar";
import { EditLogDayPreview } from "@/components/syllabus/EditLogDayPreview";
import type { SyllabusTopic as Topic } from "@/components/syllabus/TopicEditModal";
import type { CompletionDates } from "@/lib/completion-dates";
import type { DateString } from "@/lib/dates";
import { cn } from "@/lib/cn";
import {
  fetchEditLogScheduleHint,
  saveEditLogBackfill,
  saveEditLogRelog,
  saveEditLogRemove,
} from "@/lib/actions/edit-log";
import { fetchDayDetail } from "@/lib/actions/day";
import type { PhaseBounds } from "@/lib/study-day";
import { isTopicComplete } from "@/lib/progress";

type EditTarget = {
  subtopicId: string | null;
  label: string;
  currentDate: string | null;
};

type ConfirmKind =
  | {
      type: "relog";
      from: string;
      to: string;
      scheduledFor: string | null;
    }
  | {
      type: "backfill";
      to: string;
      scheduledFor: string | null;
    }
  | { type: "remove"; onDate: string; scheduledFor: null };

function formatLogDate(date: string | null, today: string) {
  if (!date) return "Not logged";
  return date === today ? "Today" : date;
}

function topicCompletedOnDate(
  topic: Topic,
  completionDates: CompletionDates,
  volatileSubtopicIds: Set<string>,
  volatileTopicIds: Set<string>,
  today: string,
): string | null {
  if (topic.subtopics.length === 0) {
    const d =
      completionDates.byTopicId[topic.id] ??
      (volatileTopicIds.has(topic.id) ? today : null);
    return d;
  }
  const dates = topic.subtopics
    .map(
      (s) =>
        completionDates.bySubtopicId[s.id] ??
        (volatileSubtopicIds.has(s.id) ? today : null),
    )
    .filter((d): d is string => Boolean(d));
  if (dates.length !== topic.subtopics.length) return null;
  return dates.sort().at(-1) ?? null;
}

function willTopicCompleteAfter(
  topic: Topic,
  completionDates: CompletionDates,
  volatileSubtopicIds: Set<string>,
  volatileTopicIds: Set<string>,
  today: string,
  target: EditTarget,
  mode: "backfill" | "relog" | "remove",
  pickDate?: string,
): boolean {
  if (topic.subtopics.length === 0) {
    if (mode === "remove") return false;
    return true;
  }
  const logged = new Map<string, string>();
  for (const s of topic.subtopics) {
    const d =
      completionDates.bySubtopicId[s.id] ??
      (volatileSubtopicIds.has(s.id) ? today : null);
    if (d) logged.set(s.id, d);
  }
  if (mode === "remove" && target.subtopicId) {
    logged.delete(target.subtopicId);
  } else if (mode === "backfill" && target.subtopicId && pickDate) {
    logged.set(target.subtopicId, pickDate);
  } else if (mode === "relog" && target.subtopicId) {
    logged.set(target.subtopicId, pickDate ?? target.currentDate ?? today);
  }
  if (logged.size !== topic.subtopics.length) return false;
  const subs = topic.subtopics.map((s) => ({
    weight: s.weight,
    completedAt: logged.has(s.id) ? "1" : null,
  }));
  return isTopicComplete({ weight: topic.weight, completedAt: null }, subs);
}

export function TopicEditLogModal({
  open,
  topic,
  objectiveId,
  today,
  objectiveStart,
  objectiveEnd,
  phase,
  calendarDays,
  completionDates,
  volatileSubtopicIds,
  volatileTopicIds,
  onClose,
  onSaved,
}: {
  open: boolean;
  topic: Topic;
  objectiveId: string;
  today: DateString;
  objectiveStart: DateString;
  objectiveEnd: DateString;
  phase: PhaseBounds | null;
  calendarDays: Record<string, DayStat>;
  completionDates: CompletionDates;
  volatileSubtopicIds: Set<string>;
  volatileTopicIds: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<EditTarget | null>(null);
  const [pick, setPick] = useState<DateString | "">("");
  const [previewDate, setPreviewDate] = useState<DateString | null>(null);
  const [dayDetail, setDayDetail] = useState<Awaited<
    ReturnType<typeof fetchDayDetail>
  > | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const topicDoneDate = useMemo(
    () =>
      topicCompletedOnDate(
        topic,
        completionDates,
        volatileSubtopicIds,
        volatileTopicIds,
        today,
      ),
    [topic, completionDates, volatileSubtopicIds, volatileTopicIds, today],
  );

  const rows = useMemo((): EditTarget[] => {
    if (topic.subtopics.length === 0) {
      const d =
        completionDates.byTopicId[topic.id] ??
        (volatileTopicIds.has(topic.id) ? today : null);
      return [
        {
          subtopicId: null,
          label: topic.title,
          currentDate: d,
        },
      ];
    }
    return topic.subtopics.map((s) => {
      const d =
        completionDates.bySubtopicId[s.id] ??
        (volatileSubtopicIds.has(s.id) ? today : null);
      return {
        subtopicId: s.id,
        label: s.title,
        currentDate: d,
      };
    });
  }, [topic, completionDates, volatileSubtopicIds, volatileTopicIds, today]);

  useEffect(() => {
    if (!open) {
      setTarget(null);
      setPick("");
      setPreviewDate(null);
      setDayDetail(null);
      setConfirm(null);
    }
  }, [open]);

  useEffect(() => {
    if (!previewDate) {
      setDayDetail(null);
      return;
    }
    let cancelled = false;
    setDayLoading(true);
    fetchDayDetail(objectiveId, previewDate)
      .then((d) => {
        if (!cancelled) setDayDetail(d);
      })
      .finally(() => {
        if (!cancelled) setDayLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [objectiveId, previewDate]);

  useEffect(() => {
    if (pick) setPreviewDate(pick);
  }, [pick]);

  useEffect(() => {
    if (target?.currentDate && target.currentDate < today) {
      setPreviewDate(target.currentDate);
    }
  }, [target, today]);

  const beginEdit = (row: EditTarget) => {
    setTarget(row);
    const initial =
      row.currentDate && row.currentDate < today
        ? row.currentDate
        : "";
    setPick(initial);
    if (row.currentDate && row.currentDate < today) {
      setPreviewDate(row.currentDate);
    }
  };

  const yesterday = useMemo(() => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10) as DateString;
  }, [today]);

  const canPickSave =
    Boolean(target) &&
    Boolean(pick) &&
    pick < today &&
    pick >= objectiveStart &&
    pick <= objectiveEnd &&
    pick !== target?.currentDate;

  const openConfirmForPick = useCallback(async () => {
    if (!target || !pick) return;
    const scheduledFor = (await fetchEditLogScheduleHint(objectiveId, topic.id)) ?? null;
    const completes = willTopicCompleteAfter(
      topic,
      completionDates,
      volatileSubtopicIds,
      volatileTopicIds,
      today,
      target,
      target.currentDate ? "relog" : "backfill",
      pick,
    );
    const showSchedule = completes ? scheduledFor : null;
    if (target.currentDate) {
      setConfirm({
        type: "relog",
        from: target.currentDate,
        to: pick,
        scheduledFor: showSchedule,
      });
    } else {
      setConfirm({
        type: "backfill",
        to: pick,
        scheduledFor: showSchedule,
      });
    }
  }, [
    target,
    pick,
    objectiveId,
    topic,
    completionDates,
    volatileSubtopicIds,
    volatileTopicIds,
    today,
  ]);

  const openConfirmForRemove = useCallback(() => {
    if (!target?.currentDate) return;
    setConfirm({
      type: "remove",
      onDate: target.currentDate,
      scheduledFor: null,
    });
  }, [target]);

  const runSave = () => {
    if (!confirm || !target) return;
    startTransition(async () => {
      try {
        setSaveError(null);
        if (confirm.type === "remove") {
          await saveEditLogRemove(topic.id, target.subtopicId);
        } else if (confirm.type === "backfill") {
          await saveEditLogBackfill(topic.id, target.subtopicId, confirm.to);
        } else {
          await saveEditLogRelog(
            topic.id,
            target.subtopicId,
            confirm.from,
            confirm.to,
          );
        }
        setConfirm(null);
        onSaved();
        onClose();
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "Could not save");
        setConfirm(null);
      }
    });
  };

  const currentLogDates =
    target?.currentDate && target.currentDate < today ? [target.currentDate] : [];

  return (
    <>
      <Modal
        open={open}
        wide="3xl"
        title="Edit completion log"
        description={`“${topic.title}” — change when subtopics were marked done (past days only).`}
        onClose={onClose}
      >
        {saveError ? (
          <p className="mb-3 text-xs text-[var(--danger)]">{saveError}</p>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="min-w-0 space-y-2 border-b border-[var(--border)] pb-4 lg:border-b-0 lg:border-r lg:pr-4 lg:pb-0">
            <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              Log entries
            </p>
            {topic.subtopics.length > 0 && (
              <p className="text-xs text-[var(--text-muted)]">
                Topic completed on{" "}
                <span className="font-mono text-[var(--text)]">
                  {topicDoneDate ? formatLogDate(topicDoneDate, today) : "—"}
                </span>
              </p>
            )}
            <ul className="space-y-1">
              {rows.map((row) => {
                const active = target?.subtopicId === row.subtopicId;
                return (
                  <li
                    key={row.subtopicId ?? "leaf"}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md border px-2 py-2 text-sm",
                      active
                        ? "border-[var(--accent)] bg-[var(--bg-muted)]/50"
                        : "border-[var(--border)]",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.label}</p>
                      <p className="font-mono text-[10px] text-[var(--text-muted)]">
                        {formatLogDate(row.currentDate, today)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn shrink-0 px-2 py-0.5 text-[10px]"
                      disabled={pending}
                      onClick={() => beginEdit(row)}
                    >
                      Edit
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="min-w-0 space-y-2 border-b border-[var(--border)] pb-4 lg:border-b-0 lg:border-r lg:px-1 lg:pb-0 lg:pr-4">
            <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              Past day
            </p>
            {!target ? (
              <p className="text-xs text-[var(--text-muted)]">
                Select Edit on a log entry to pick or remove a date.
              </p>
            ) : (
              <>
                <p className="text-xs text-[var(--text-muted)]">
                  {target.currentDate
                    ? `Change “${target.label}” from ${formatLogDate(target.currentDate, today)}.`
                    : `Add a past log for “${target.label}”.`}
                </p>
                <CompactPlanDateGrid
                  days={calendarDays}
                  today={today}
                  objectiveStart={objectiveStart}
                  objectiveEnd={objectiveEnd}
                  phase={phase}
                  topicAssignedDates={currentLogDates}
                  selectedDate={pick}
                  initialMonth={pick || target.currentDate || yesterday}
                  selectionMode="pastLog"
                  onSelect={(date) => setPick(date)}
                />
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    className="btn btn-primary text-xs"
                    disabled={pending || !canPickSave}
                    onClick={() => void openConfirmForPick()}
                  >
                    Save date
                  </button>
                  {target.currentDate ? (
                    <button
                      type="button"
                      className="btn text-xs text-[var(--danger)]"
                      disabled={pending}
                      onClick={openConfirmForRemove}
                    >
                      Remove log
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </section>

          <section className="min-w-0">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              That day in your cycle
            </p>
            <EditLogDayPreview
              date={previewDate}
              detail={dayDetail}
              loading={dayLoading}
            />
          </section>
        </div>
      </Modal>

      <Modal
        open={Boolean(confirm)}
        title="Confirm log change"
        onClose={() => !pending && setConfirm(null)}
      >
        {confirm?.type === "relog" && (
          <p className="text-sm">
            Move log from <span className="font-mono">{confirm.from}</span> to{" "}
            <span className="font-mono">{confirm.to}</span>?
            {confirm.scheduledFor ? (
              <>
                {" "}
                This topic was scheduled for{" "}
                <span className="font-mono">{confirm.scheduledFor}</span>; completing it
                will clear that plan.
              </>
            ) : null}
          </p>
        )}
        {confirm?.type === "backfill" && (
          <p className="text-sm">
            Log on <span className="font-mono">{confirm.to}</span>?
            {confirm.scheduledFor ? (
              <>
                {" "}
                This topic was scheduled for{" "}
                <span className="font-mono">{confirm.scheduledFor}</span>; completing it
                will clear that plan.
              </>
            ) : null}
          </p>
        )}
        {confirm?.type === "remove" && (
          <p className="text-sm">
            Remove log dated <span className="font-mono">{confirm.onDate}</span> for "
            {target?.label}"?
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="btn text-xs"
            disabled={pending}
            onClick={() => setConfirm(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary text-xs"
            disabled={pending}
            onClick={runSave}
          >
            {pending ? "Saving…" : "Confirm"}
          </button>
        </div>
      </Modal>
    </>
  );
}
