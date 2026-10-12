"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CalendarPlus } from "lucide-react";
import { moveTopicPlanToDay, scheduleTopicOnDay } from "@/lib/actions/day";
import { addTopicsToPhase, removeTopicFromPhase } from "@/lib/actions/phases";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import type { DayStat } from "@/components/calendar/ContributionCalendar";
import { TopicScheduleQuickModal } from "@/components/home/TopicScheduleQuickModal";
import {
  findTopicInSubjects,
  topicHasProgressOnDate,
} from "@/lib/topic-day-progress";
import type { PhaseBounds } from "@/lib/study-day";
import {
  TopicPickerModal,
  type CompletionDates,
} from "@/components/home/TopicPickerModal";
import { DraggablePhaseTopicRow } from "@/components/home/PlanTopicDragDrop";
import { topicTotalWeight } from "@/lib/progress";
import { isTopicComplete } from "@/lib/progress";
import {
  projectedIsTopicComplete,
  projectedTopicCompletedWeight,
  dephaseBlockReason,
  topicBlocksDephase,
  volatileKeysFromCompletionDates,
  type VolatileTodayKeys,
} from "@/lib/progress-projection";
import { useCompletionDates } from "@/lib/completion-dates-context";

export type HomeTopic = {
  id: string;
  subjectId: string;
  title: string;
  weight: number;
  sortOrder: number;
  completedAt: string | null;
  notes: string | null;
  subtopics: {
    id: string;
    title: string;
    weight: number;
    completedAt: string | null;
    notes: string | null;
  }[];
};

export type HomeSubject = {
  id: string;
  name: string;
  color: string;
  topics: HomeTopic[];
};

function formatScheduledLabel(
  dates: string[] | undefined,
  today: string,
): string {
  if (!dates?.length) return "—";
  return dates.map((d) => (d === today ? "today" : d)).join(", ");
}

function formatLoggedLabel(date: string | null, today: string): string {
  if (!date) return "—";
  return date === today ? "today" : date;
}

/** Last calendar day work was logged (max subtopic date, or leaf topic date). */
function subtopicLoggedDate(
  subtopicId: string,
  completionDates: CompletionDates,
  volatileToday: VolatileTodayKeys,
  today: string,
): string | null {
  const d = completionDates.bySubtopicId[subtopicId];
  if (d) return d;
  if (volatileToday.subtopicIds.has(subtopicId)) return today;
  return null;
}

function topicCompletionLoggedDate(
  topic: HomeTopic,
  completionDates: CompletionDates,
  volatileToday: VolatileTodayKeys,
  today: string,
): string | null {
  const dates: string[] = [];
  if (topic.subtopics.length === 0) {
    const d = completionDates.byTopicId[topic.id];
    if (d) dates.push(d);
    else if (volatileToday.topicIds.has(topic.id)) dates.push(today);
  } else {
    for (const s of topic.subtopics) {
      const d = completionDates.bySubtopicId[s.id];
      if (d) dates.push(d);
      else if (volatileToday.subtopicIds.has(s.id)) dates.push(today);
    }
  }
  if (dates.length === 0) return null;
  return dates.sort().at(-1) ?? null;
}

function TickIcon({ done, color }: { done: boolean; color: string }) {
  if (!done) {
    return <span className="inline-block w-4 text-center text-[var(--text-muted)]">—</span>;
  }
  return (
    <span style={{ color }} aria-label="completed">
      ✓
    </span>
  );
}

function PhaseTopicRows({
  rows,
  tab,
  expandedTopicIds,
  onToggleTopicExpand,
  completionDates,
  readOnly,
  currentPhaseId,
  pending,
  onRemove,
  phaseScheduleByTopic,
  today,
  volatileToday,
  phaseScheduleDragEnabled,
  onScheduleClick,
  emptyActiveMessage,
}: {
  rows: { subject: HomeSubject; topic: HomeTopic; serial: number }[];
  tab: "active" | "completed";
  emptyActiveMessage?: string;
  expandedTopicIds: Set<string>;
  onToggleTopicExpand: (topicId: string) => void;
  completionDates: CompletionDates;
  readOnly: boolean;
  currentPhaseId: string;
  pending: boolean;
  onRemove: (topicId: string) => void;
  onScheduleClick: (topic: HomeTopic) => void;
  phaseScheduleByTopic: Record<string, string[]>;
  today: string;
  volatileToday: VolatileTodayKeys;
  phaseScheduleDragEnabled?: boolean;
}) {
  return (
    <>
      {rows.length === 0 && (
        <tr>
          <td colSpan={readOnly ? 5 : 6} className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">
            {tab === "active"
              ? (emptyActiveMessage ??
                "No active topics in this phase.")
              : "No completed topics in this phase yet."}
          </td>
        </tr>
      )}
      {rows.map(({ subject, topic, serial }) => {
        const open = expandedTopicIds.has(topic.id);
        const totalWt = topicTotalWeight(topic, topic.subtopics);
        const doneWt = projectedTopicCompletedWeight(
          topic,
          topic.subtopics,
          volatileToday,
        );
        const pct = totalWt > 0 ? Math.round((doneWt / totalWt) * 100) : 0;
        const complete = projectedIsTopicComplete(
          topic,
          topic.subtopics,
          volatileToday,
        );
        const dephaseBlocked = topicBlocksDephase(
          topic,
          topic.subtopics,
          volatileToday,
        );
        const dephaseBlockTitle = dephaseBlockReason(
          topic,
          topic.subtopics,
          volatileToday,
        );
        const isScheduled = (phaseScheduleByTopic[topic.id]?.length ?? 0) > 0;
        const dragEnabled =
          phaseScheduleDragEnabled &&
          tab === "active" &&
          !readOnly &&
          !complete &&
          !isScheduled;
        const hasSubs = topic.subtopics.length > 0;
        const rowClass = "border-b border-[var(--border)] hover:bg-[var(--bg-muted)]/40";
        const rowCells = (
          <>
              <td className="px-2 py-2 font-mono text-xs text-[var(--text-muted)]">{serial}</td>
              <td className="px-3 py-2">
                {hasSubs ? (
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 text-left"
                    onClick={() => onToggleTopicExpand(topic.id)}
                  >
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">
                      {open ? "▾" : "▸"}
                    </span>
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: subject.color }}
                    />
                    <span className="font-medium">{topic.title}</span>
                  </button>
                ) : (
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: subject.color }}
                    />
                    <span className="font-medium">{topic.title}</span>
                  </div>
                )}
              </td>
              <td className="px-2 py-2 font-mono text-xs">
                {topicTotalWeight(topic, topic.subtopics)}
              </td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-12 overflow-hidden rounded bg-[var(--bg-muted)]">
                    <div
                      className="h-full rounded"
                      style={{ width: `${pct}%`, background: subject.color }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">{pct}%</span>
                </div>
              </td>
              <td className="px-2 py-2 font-mono text-[10px] text-[var(--text-muted)]">
                {tab === "completed"
                  ? formatLoggedLabel(
                      topicCompletionLoggedDate(
                        topic,
                        completionDates,
                        volatileToday,
                        today,
                      ),
                      today,
                    )
                  : formatScheduledLabel(phaseScheduleByTopic[topic.id], today)}
              </td>
              {!readOnly && tab === "active" && (
                <td className="whitespace-nowrap px-2 py-2">
                  <div className="inline-flex items-center gap-1.5">
                    {phaseScheduleDragEnabled && !complete && (
                      <button
                        type="button"
                        className="btn btn-schedule inline-flex h-[22px] min-w-[26px] items-center justify-center px-1.5 py-0 disabled:opacity-40"
                        disabled={pending}
                        aria-label={
                          isScheduled ? "Reschedule on calendar" : "Schedule on calendar"
                        }
                        title={
                          isScheduled
                            ? `Reschedule · currently ${formatScheduledLabel(phaseScheduleByTopic[topic.id], today)}`
                            : "Schedule on a day"
                        }
                        onClick={() => onScheduleClick(topic)}
                      >
                        {isScheduled ? (
                          <CalendarClock className="h-3.5 w-3.5" strokeWidth={2.5} />
                        ) : (
                          <CalendarPlus className="h-3.5 w-3.5" strokeWidth={2.5} />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn inline-flex h-[22px] min-w-[26px] items-center justify-center px-1.5 py-0 text-[9px] leading-none text-[var(--danger)] disabled:opacity-40 disabled:hover:border-[var(--border)] disabled:hover:text-[var(--danger)]"
                      disabled={pending || dephaseBlocked}
                      aria-label="Remove from phase"
                      title={dephaseBlockTitle ?? "Remove from phase"}
                      onClick={() => onRemove(topic.id)}
                    >
                      −φ
                    </button>
                  </div>
                </td>
              )}
              {!readOnly && tab === "completed" && <td className="px-2 py-2 text-[10px] text-[var(--text-muted)]">—</td>}
          </>
        );
        return (
          <Fragment key={topic.id}>
            {dragEnabled ? (
              <DraggablePhaseTopicRow
                topicId={topic.id}
                topicTitle={topic.title}
                subjectName={subject.name}
                subjectColor={subject.color}
                weightLabel={`${topicTotalWeight(topic, topic.subtopics)} wt`}
                className={rowClass}
              >
                {rowCells}
              </DraggablePhaseTopicRow>
            ) : (
              <tr className={rowClass}>{rowCells}</tr>
            )}
            {open &&
              hasSubs &&
              topic.subtopics.map((s) => {
                const subDone =
                  Boolean(s.completedAt) ||
                  volatileToday.subtopicIds.has(s.id);
                return (
                  <tr
                    key={s.id}
                    className="border-b border-[var(--border)] bg-[var(--bg-muted)]/20 text-xs"
                  >
                    <td className="px-2 py-1.5" />
                    <td className="px-3 py-1.5 pl-8">
                      <span className="inline-flex items-center gap-2">
                        <TickIcon done={subDone} color={subject.color} />
                        <span>{s.title}</span>
                      </span>
                    </td>
                    <td className="px-2 py-1.5 font-mono">{s.weight}</td>
                    <td className="px-2 py-1.5 font-mono text-[10px] text-[var(--text-muted)]">
                      {formatLoggedLabel(
                        subtopicLoggedDate(
                          s.id,
                          completionDates,
                          volatileToday,
                          today,
                        ),
                        today,
                      )}
                    </td>
                    <td className="px-2 py-1.5" aria-hidden />
                    {!readOnly && <td className="px-2 py-1.5" />}
                  </tr>
                );
              })}
          </Fragment>
        );
      })}
    </>
  );
}

export function PhaseTargetsTable({
  subjects,
  phaseTopicIds,
  currentPhaseId,
  readOnly,
  completionDates: _serverCompletionDates,
  phaseScheduleByTopic,
  today,
  phaseScheduleDragEnabled = false,
  objectiveId,
  objectiveStart,
  objectiveEnd,
  phaseStart,
  phaseEnd,
  calendarDays,
}: {
  subjects: HomeSubject[];
  phaseTopicIds: string[];
  currentPhaseId: string | null;
  readOnly: boolean;
  completionDates: CompletionDates;
  phaseScheduleByTopic: Record<string, string[]>;
  today: string;
  phaseScheduleDragEnabled?: boolean;
  objectiveId: string;
  objectiveStart: string;
  objectiveEnd: string;
  phaseStart: string | null;
  phaseEnd: string | null;
  calendarDays: Record<string, DayStat>;
}) {
  const router = useRouter();
  const { completionDates } = useCompletionDates();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"active" | "completed">("active");
  const [expandedTopicIds, setExpandedTopicIds] = useState<Set<string>>(
    () => new Set(),
  );

  function toggleTopicExpand(topicId: string) {
    setExpandedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  }
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [removeTopicId, setRemoveTopicId] = useState<string | null>(null);
  const [scheduleModal, setScheduleModal] = useState<{
    topicId: string;
    title: string;
    mode: "schedule" | "reschedule";
    dates: string[];
  } | null>(null);
  const [scheduleShiftConfirm, setScheduleShiftConfirm] = useState<{
    topicId: string;
    title: string;
    toDate: string;
    conflictDates: string[];
    discardTodayProgress: boolean;
  } | null>(null);
  const [rescheduleTodayConfirm, setRescheduleTodayConfirm] = useState<{
    topicId: string;
    title: string;
    fromDate: string;
    toDate: string;
  } | null>(null);

  const phaseSet = useMemo(() => new Set(phaseTopicIds), [phaseTopicIds]);

  const addableTopicCount = useMemo(() => {
    let n = 0;
    for (const subject of subjects) {
      for (const topic of subject.topics) {
        if (phaseSet.has(topic.id)) continue;
        if (isTopicComplete(topic, topic.subtopics)) continue;
        n += 1;
      }
    }
    return n;
  }, [subjects, phaseSet]);

  const emptyActiveMessage =
    phaseTopicIds.length === 0
      ? "No topics in this phase yet. Use Add topics to include active syllabus topics here, or add topics on the Syllabus page first if your syllabus is empty."
      : undefined;

  const phaseBounds: PhaseBounds | null =
    phaseStart && phaseEnd ? { startDate: phaseStart, endDate: phaseEnd } : null;

  const volatileToday = useMemo(
    () =>
      volatileKeysFromCompletionDates(completionDates, today),
    [completionDates, today],
  );

  function buildRows(completed: boolean) {
    const rows: { subject: HomeSubject; topic: HomeTopic; serial: number }[] = [];
    for (const subject of subjects) {
      let n = 0;
      for (const topic of subject.topics) {
        if (!phaseSet.has(topic.id)) continue;
        const done = projectedIsTopicComplete(
          topic,
          topic.subtopics,
          volatileToday,
        );
        if (completed !== done) continue;
        n += 1;
        rows.push({ subject, topic, serial: n });
      }
    }
    return rows;
  }

  const activeRows = useMemo(
    () => buildRows(false),
    [subjects, phaseSet, volatileToday],
  );
  const completedRows = useMemo(
    () => buildRows(true),
    [subjects, phaseSet, volatileToday],
  );

  const activeBySubject = useMemo(() => {
    const map = new Map<string, typeof activeRows>();
    for (const row of activeRows) {
      if (!map.has(row.subject.id)) map.set(row.subject.id, []);
      map.get(row.subject.id)!.push(row);
    }
    return [...map.values()];
  }, [activeRows]);

  const completedBySubject = useMemo(() => {
    const map = new Map<string, typeof completedRows>();
    for (const row of completedRows) {
      if (!map.has(row.subject.id)) map.set(row.subject.id, []);
      map.get(row.subject.id)!.push(row);
    }
    return [...map.values()];
  }, [completedRows]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  function openScheduleModal(topic: HomeTopic) {
    const dates = phaseScheduleByTopic[topic.id] ?? [];
    setScheduleModal({
      topicId: topic.id,
      title: topic.title,
      mode: dates.length > 0 ? "reschedule" : "schedule",
      dates,
    });
  }

  async function finishSchedule(toDate: string, shiftFromOtherDays: boolean) {
    if (!scheduleModal) return;
    const result = await scheduleTopicOnDay(
      objectiveId,
      toDate,
      scheduleModal.topicId,
      shiftFromOtherDays,
    );
    if (!result.ok) {
      const topic = findTopicInSubjects(scheduleModal.topicId, subjects);
      const discardTodayProgress =
        result.conflictDates.includes(today) &&
        Boolean(topic && topicHasProgressOnDate(topic, today, completionDates));
      setScheduleShiftConfirm({
        topicId: scheduleModal.topicId,
        title: scheduleModal.title,
        toDate,
        conflictDates: result.conflictDates,
        discardTodayProgress,
      });
      return;
    }
    setScheduleModal(null);
    setScheduleShiftConfirm(null);
    refresh();
  }

  async function handleSchedulePick(toDate: string) {
    if (!scheduleModal) return;
    const { topicId, mode, dates } = scheduleModal;
    if (mode === "reschedule" && dates.length === 1) {
      const fromDate = dates[0];
      if (fromDate === toDate) {
        setScheduleModal(null);
        return;
      }
      const topic = findTopicInSubjects(topicId, subjects);
      if (
        fromDate === today &&
        topic &&
        topicHasProgressOnDate(topic, today, completionDates)
      ) {
        setRescheduleTodayConfirm({
          topicId,
          title: scheduleModal.title,
          fromDate,
          toDate,
        });
        return;
      }
      startTransition(async () => {
        await moveTopicPlanToDay(objectiveId, fromDate, toDate, topicId);
        setScheduleModal(null);
        refresh();
      });
      return;
    }
    if (mode === "reschedule") {
      startTransition(() => void finishSchedule(toDate, true));
      return;
    }
    startTransition(() => void finishSchedule(toDate, false));
  }

  if (!currentPhaseId) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Set a phase to manage phase targets here.
      </p>
    );
  }

  const colCount = readOnly ? 5 : 6;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-medium">Phase targets</h3>
          <p className="text-xs text-[var(--text-muted)]">
            Drag onto the calendar, or use the calendar icon to schedule or reschedule. Completions
            are logged on today only.
          </p>
        </div>
        {!readOnly && tab === "active" && (
          <button
            type="button"
            className="btn btn-primary text-xs disabled:opacity-40"
            disabled={addableTopicCount === 0}
            title={
              addableTopicCount === 0
                ? "No active syllabus topics available to add. Add or uncomplete topics on the Syllabus page."
                : undefined
            }
            onClick={() => setAddModalOpen(true)}
          >
            Add topics
          </button>
        )}
      </div>

      <div className="flex gap-2 border-b border-[var(--border)]">
        <button
          type="button"
          className={`px-3 py-2 text-xs font-medium ${tab === "active" ? "border-b-2 border-[var(--accent)] text-[var(--text)]" : "text-[var(--text-muted)]"}`}
          onClick={() => setTab("active")}
        >
          Active ({activeRows.length})
        </button>
        <button
          type="button"
          className={`px-3 py-2 text-xs font-medium ${tab === "completed" ? "border-b-2 border-[var(--accent)] text-[var(--text)]" : "text-[var(--text-muted)]"}`}
          onClick={() => setTab("completed")}
        >
          Completed ({completedRows.length})
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--bg-muted)] font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            <tr>
              <th className="w-8 px-2 py-2">#</th>
              <th className="px-3 py-2">Topic</th>
              <th className="w-14 px-2 py-2">Wt</th>
              <th className="w-24 px-2 py-2">Progress</th>
              <th className="w-28 px-2 py-2">
                {tab === "completed" ? "Completed on" : "Scheduled"}
              </th>
              {!readOnly && (
                <th className="w-[4.75rem] whitespace-nowrap px-2 py-2">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {(tab === "active" ? activeBySubject : completedBySubject).map((subjectRows) => {
              const subject = subjectRows[0].subject;
              return (
                <Fragment key={subject.id}>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-muted)]/50">
                    <td colSpan={colCount} className="px-3 py-2">
                      <span
                        className="mr-2 inline-block h-2 w-2 rounded-full"
                        style={{ background: subject.color }}
                      />
                      <span className="font-medium">{subject.name}</span>
                    </td>
                  </tr>
                  <PhaseTopicRows
                    rows={subjectRows}
                    tab={tab}
                    expandedTopicIds={expandedTopicIds}
                    onToggleTopicExpand={toggleTopicExpand}
                    completionDates={completionDates}
                    readOnly={readOnly}
                    currentPhaseId={currentPhaseId}
                    pending={pending}
                    onRemove={(id) => setRemoveTopicId(id)}
                    onScheduleClick={openScheduleModal}
                    phaseScheduleByTopic={phaseScheduleByTopic}
                    today={today}
                    volatileToday={volatileToday}
                    phaseScheduleDragEnabled={phaseScheduleDragEnabled}
                  />
                </Fragment>
              );
            })}
            {(tab === "active" ? activeBySubject : completedBySubject).length === 0 && (
              <PhaseTopicRows
                rows={[]}
                tab={tab}
                emptyActiveMessage={emptyActiveMessage}
                expandedTopicIds={expandedTopicIds}
                onToggleTopicExpand={toggleTopicExpand}
                completionDates={completionDates}
                readOnly={readOnly}
                currentPhaseId={currentPhaseId}
                pending={pending}
                onRemove={(id) => setRemoveTopicId(id)}
                onScheduleClick={openScheduleModal}
                phaseScheduleByTopic={phaseScheduleByTopic}
                today={today}
                volatileToday={volatileToday}
                phaseScheduleDragEnabled={phaseScheduleDragEnabled}
              />
            )}
          </tbody>
        </table>
      </div>

      <TopicPickerModal
        open={addModalOpen}
        title="Add topics to phase"
        description="Active syllabus topics only. Completed topics are hidden. Selecting a topic targets all remaining subtopics in this phase."
        subjects={subjects}
        excludeTopicIds={phaseSet}
        completionDates={completionDates}
        confirmLabel="Add to phase"
        pending={pending}
        onClose={() => setAddModalOpen(false)}
        onConfirm={async (ids) => {
          await addTopicsToPhase(currentPhaseId, ids);
          setAddModalOpen(false);
          refresh();
        }}
      />

      <ConfirmModal
        open={Boolean(removeTopicId)}
        title="Remove from phase?"
        description="Removes the topic from this phase and unschedules it from today and any future days on your calendar. Committed past logs are unchanged."
        confirmLabel="Remove"
        danger={true}
        pending={pending}
        onClose={() => setRemoveTopicId(null)}
        onConfirm={() =>
          startTransition(async () => {
            if (!removeTopicId) return;
            await removeTopicFromPhase(currentPhaseId, removeTopicId);
            setRemoveTopicId(null);
            refresh();
          })
        }
      />

      <TopicScheduleQuickModal
        open={Boolean(scheduleModal)}
        topicTitle={scheduleModal?.title ?? ""}
        mode={scheduleModal?.mode ?? "schedule"}
        currentDates={scheduleModal?.dates ?? []}
        today={today}
        objectiveStart={objectiveStart}
        objectiveEnd={objectiveEnd}
        phase={phaseBounds}
        calendarDays={calendarDays}
        pending={pending}
        onClose={() => setScheduleModal(null)}
        onConfirm={(date) => void handleSchedulePick(date)}
      />

      <ConfirmModal
        open={Boolean(scheduleShiftConfirm)}
        title={
          scheduleShiftConfirm?.discardTodayProgress
            ? "Move plan and clear today's progress?"
            : "Move scheduled topic here?"
        }
        description={
          scheduleShiftConfirm
            ? scheduleShiftConfirm.discardTodayProgress
              ? `“${scheduleShiftConfirm.title}” is on today with logged work. Moving it to ${scheduleShiftConfirm.toDate} clears today's checks.`
              : `“${scheduleShiftConfirm.title}” is already planned on ${scheduleShiftConfirm.conflictDates.join(", ")}. Move it to ${scheduleShiftConfirm.toDate}?`
            : ""
        }
        confirmLabel={
          scheduleShiftConfirm?.discardTodayProgress ? "Clear and move" : "Move here"
        }
        danger={Boolean(scheduleShiftConfirm?.discardTodayProgress)}
        pending={pending}
        onClose={() => setScheduleShiftConfirm(null)}
        onConfirm={() => {
          if (!scheduleShiftConfirm) return;
          startTransition(async () => {
            await finishSchedule(scheduleShiftConfirm.toDate, true);
          });
        }}
      />

      <ConfirmModal
        open={Boolean(rescheduleTodayConfirm)}
        title="Reschedule and clear today's progress?"
        description={
          rescheduleTodayConfirm
            ? `Move “${rescheduleTodayConfirm.title}” from today to ${rescheduleTodayConfirm.toDate}? Today's checks on this topic will be cleared.`
            : ""
        }
        confirmLabel="Clear and reschedule"
        danger={true}
        pending={pending}
        onClose={() => setRescheduleTodayConfirm(null)}
        onConfirm={() => {
          if (!rescheduleTodayConfirm) return;
          const { topicId, fromDate, toDate } = rescheduleTodayConfirm;
          startTransition(async () => {
            await moveTopicPlanToDay(objectiveId, fromDate, toDate, topicId);
            setScheduleModal(null);
            setRescheduleTodayConfirm(null);
            refresh();
          });
        }}
      />
    </div>
  );
}
