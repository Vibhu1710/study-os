"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { ContributionCalendar } from "@/components/calendar/ContributionCalendar";
import { DayTargetPanel } from "@/components/home/DayTargetPanel";
import type { CompletionDates } from "@/lib/completion-dates";
import { useCompletionDates } from "@/lib/completion-dates-context";
import {
  PhaseTargetsTable,
  type HomeSubject,
} from "@/components/home/PhaseTargetsTable";
import { cn } from "@/lib/cn";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import {
  fetchCalendarStats,
  moveTopicPlanToDay,
  scheduleTopicOnDay,
} from "@/lib/actions/day";
import {
  findTopicInSubjects,
  topicHasProgressOnDate,
} from "@/lib/topic-day-progress";
import { createPhase, updateCurrentPhase } from "@/lib/actions/phases";
import { deleteTopic } from "@/lib/actions/topics";
import { DangerousTopicDeleteModal } from "@/components/syllabus/DangerousTopicDeleteModal";
import {
  TopicEditModal,
  type SyllabusSubjectBucket,
  type SyllabusTopic,
} from "@/components/syllabus/TopicEditModal";
import { topicDeleteImpact } from "@/lib/syllabus-delete";
import { volatileKeysFromCompletionDates } from "@/lib/progress-projection";
import {
  type PlanTopicDragData,
  PlanTopicDragPreview,
  parseDayDropId,
} from "@/components/home/PlanTopicDragDrop";
import { DateRangePickers } from "@/components/ui/DatePicker";
import {
  inclusiveDayCount,
  MIN_PHASE_DAYS,
  type DateString,
} from "@/lib/date-span";
import {
  hasRoomForMinPhase,
  maxDateString,
  maxPhaseStartDate,
  minDateString,
  phaseEndLeavesShortRemainder,
  phaseEndLockedToCycle,
  toDateString,
} from "@/lib/dates";
import { canCompleteOnDay, canPlanOnDay } from "@/lib/study-day";
import type { DayStat } from "@/components/calendar/ContributionCalendar";

type PlanItem = {
  id: string;
  topicId: string;
  subtopicId: string | null;
  topic: {
    title: string;
    weight: number;
    completedAt: string | null;
    subject: { name: string; color: string };
    subtopics: { id: string; title: string; weight: number; completedAt: string | null }[];
  };
  subtopic?: { id: string; title: string; weight: number; completedAt: string | null } | null;
};

type DayDetail = {
  events: {
    id: string;
    date: string;
    weightSnapshot: number;
    topicId: string;
    subtopicId: string | null;
    topic: { title: string };
    subtopic: { id: string; title: string } | null;
    subject: { name: string; color: string };
  }[];
  notes: {
    id: string;
    topicId: string;
    subtopicId: string | null;
    body: string;
    topic: { title: string };
    subtopic: { title: string } | null;
  }[];
  planItems: PlanItem[];
};

export function HomeWorkspace({
  objectiveId,
  objectiveName,
  objectiveStart,
  objectiveEnd,
  readOnly,
  selectedDate: initialDate,
  calendarStats,
  subjects,
  currentPhase,
  homeSubjects,
  completionDates,
  pendingPhaseTopicIds,
  dayPlanItems,
  dayDetail,
  syllabusTopics,
  currentPhaseTopicIds,
  phaseScheduleByTopic,
}: {
  objectiveId: string;
  objectiveName: string;
  objectiveStart: string;
  objectiveEnd: string;
  readOnly: boolean;
  selectedDate: string;
  calendarStats: Record<
    string,
    {
      totalWeight: number;
      plannedTotalWeight?: number;
      completedSubjectBreakdown?: {
        subjectId: string;
        name: string;
        color: string;
        weight: number;
      }[];
      plannedSubjectBreakdown?: {
        subjectId: string;
        name: string;
        color: string;
        weight: number;
      }[];
      completionCount?: number;
      plannedCount?: number;
      previews?: string[];
    }
  >;
  subjects: { id: string; name: string; color: string }[];
  completionDates: CompletionDates;
  pendingPhaseTopicIds: string[];
  currentPhase: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  } | null;
  homeSubjects: HomeSubject[];
  dayPlanItems: PlanItem[];
  dayDetail: DayDetail;
  syllabusTopics: { id: string; title: string; subjectName: string }[];
  currentPhaseTopicIds: string[];
  phaseScheduleByTopic: Record<string, string[]>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [phaseModalMode, setPhaseModalMode] = useState<"create" | "edit" | null>(null);
  const [dndReady, setDndReady] = useState(false);
  const [moveConfirm, setMoveConfirm] = useState<
    (PlanTopicDragData & { toDate: string; discardTodayProgress: boolean }) | null
  >(null);
  const [scheduleConfirm, setScheduleConfirm] = useState<
    (PlanTopicDragData & {
      toDate: string;
      conflictDates: string[];
      discardTodayProgress: boolean;
    }) | null
  >(null);
  const [movePending, setMovePending] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<PlanTopicDragData | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [topicEditId, setTopicEditId] = useState<string | null>(null);
  const [topicDeleteConfirm, setTopicDeleteConfirm] = useState<SyllabusTopic | null>(
    null,
  );
  const [topicEditPending, startTopicEditTransition] = useTransition();
  const [calendarStatsLive, setCalendarStatsLive] = useState(calendarStats);
  useEffect(() => {
    setDndReady(true);
  }, []);

  useEffect(() => {
    setCalendarStatsLive(calendarStats);
  }, [calendarStats]);

  const syncCalendarStats = useCallback(async () => {
    const stats = await fetchCalendarStats(objectiveId);
    setCalendarStatsLive(stats);
  }, [objectiveId]);

  const today = toDateString(new Date());
  const phaseBounds = currentPhase
    ? { startDate: currentPhase.startDate, endDate: currentPhase.endDate }
    : null;
  const canPlanDay =
    !readOnly && canPlanOnDay(selectedDate, objectiveStart, objectiveEnd, phaseBounds);
  const canCompleteDay =
    !readOnly &&
    canCompleteOnDay(selectedDate, objectiveStart, objectiveEnd, phaseBounds, today);
  const canSetPhase = !readOnly && !currentPhase;
  const canEditPhase = !readOnly && Boolean(currentPhase);
  const needsPhaseSetup = !readOnly && !currentPhase;
  const outsidePhase =
    currentPhase &&
    (selectedDate < currentPhase.startDate || selectedDate > currentPhase.endDate);

  const calendarDayStats = useMemo(() => {
    const days: Record<string, DayStat> = {};
    for (const [date, stat] of Object.entries(calendarStatsLive)) {
      const completedWt = stat.totalWeight ?? 0;
      days[date] = {
        totalWeight: completedWt,
        plannedTotalWeight: stat.plannedTotalWeight ?? 0,
        completedSubjectBreakdown: stat.completedSubjectBreakdown ?? [],
        plannedSubjectBreakdown: stat.plannedSubjectBreakdown ?? [],
        completionCount: stat.completionCount ?? 0,
        plannedCount: stat.plannedCount,
        previews: stat.previews,
        isProjection: date === today && completedWt > 0,
      };
    }
    return days;
  }, [calendarStatsLive, today]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  const planTopicDragEnabled = dndReady && !readOnly && Boolean(currentPhase);

  const volatileToday = useMemo(
    () => volatileKeysFromCompletionDates(completionDates, today),
    [completionDates, today],
  );

  const syllabusSubjectsForEdit = useMemo((): SyllabusSubjectBucket[] => {
    return homeSubjects.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      topics: s.topics.map((t) => ({
        id: t.id,
        subjectId: t.subjectId,
        title: t.title,
        weight: t.weight,
        sortOrder: t.sortOrder,
        completedAt: t.completedAt,
        notes: t.notes,
        subtopics: t.subtopics.map((st) => ({
          id: st.id,
          title: st.title,
          weight: st.weight,
          completedAt: st.completedAt,
          notes: st.notes,
        })),
      })),
    }));
  }, [homeSubjects]);

  const editingTopicFromHome = useMemo(() => {
    if (!topicEditId) return undefined;
    for (const s of syllabusSubjectsForEdit) {
      const t = s.topics.find((x) => x.id === topicEditId);
      if (t) return t;
    }
    return undefined;
  }, [topicEditId, syllabusSubjectsForEdit]);

  const canReceivePlanDrop = useCallback(
    (date: string) =>
      date >= today &&
      canPlanOnDay(date, objectiveStart, objectiveEnd, phaseBounds),
    [today, objectiveStart, objectiveEnd, phaseBounds],
  );

  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
  );

  function resolveDropDate(overId: string | number | undefined): string | null {
    if (overId === undefined) return null;
    return parseDayDropId(String(overId));
  }

  function handlePlanTopicDragOver(event: DragOverEvent) {
    setDragOverDate(resolveDropDate(event.over?.id));
  }

  function clearPlanTopicDrag() {
    setActiveDrag(null);
    setDragOverDate(null);
  }

  function handlePlanTopicDragEnd(event: DragEndEvent) {
    const data = event.active.data.current as PlanTopicDragData | undefined;
    const toDate = resolveDropDate(event.over?.id) ?? dragOverDate;
    clearPlanTopicDrag();
    if (!data || !toDate) return;
    if (!canReceivePlanDrop(toDate)) return;

    setMoveError(null);

    if (data.kind === "phase-schedule") {
      startTransition(async () => {
        try {
          const result = await scheduleTopicOnDay(objectiveId, toDate, data.topicId, false);
          if (!result.ok) {
            const topic = findTopicInSubjects(data.topicId, homeSubjects);
            const discardTodayProgress =
              result.conflictDates.includes(today) &&
              Boolean(topic && topicHasProgressOnDate(topic, today, completionDates));
            setScheduleConfirm({
              ...data,
              toDate,
              conflictDates: result.conflictDates,
              discardTodayProgress,
            });
            return;
          }
          if (toDate === today) {
            setSelectedDate(today);
            router.push(`/?date=${today}`);
          }
          refresh();
        } catch (e) {
          setMoveError(e instanceof Error ? e.message : "Could not schedule");
        }
      });
      return;
    }

    if (data.kind !== "day-plan" || !data.fromDate) return;
    if (data.fromDate < today) return;
    if (toDate < today) return;
    if (data.fromDate === toDate) return;

    const topic = findTopicInSubjects(data.topicId, homeSubjects);
    const discardTodayProgress =
      data.fromDate === today &&
      Boolean(topic && topicHasProgressOnDate(topic, today, completionDates));
    setMoveConfirm({ ...data, toDate, discardTodayProgress });
  }

  const calendarAndDayPanel = (
    <div
      className={cn(
        "relative grid items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(400px,1.15fr)]",
        needsPhaseSetup && "pointer-events-none select-none opacity-60",
      )}
    >
      {needsPhaseSetup && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg)]/80 p-6 text-center text-sm text-[var(--text-muted)]">
          Set a phase above to use the calendar.
        </div>
      )}
      <div className="min-w-0 w-full max-w-2xl self-start lg:max-w-[36rem]">
        <ContributionCalendar
          selectedDate={selectedDate}
          days={calendarDayStats}
          objectiveStart={objectiveStart}
          objectiveEnd={objectiveEnd}
          phaseStart={currentPhase?.startDate}
          phaseEnd={currentPhase?.endDate}
          phaseName={currentPhase?.name}
          selectedOutsidePhase={Boolean(!readOnly && outsidePhase)}
          today={today}
          planDayDropTargets={planTopicDragEnabled}
          planDropHighlightDate={dragOverDate}
          canReceivePlanDrop={canReceivePlanDrop}
          onSelect={(d) => {
            setSelectedDate(d);
            router.push(`/?date=${d}`);
          }}
        />
      </div>

      <div className="flex h-full min-h-0 min-w-0 w-full flex-col">
        <DayTargetPanel
          objectiveId={objectiveId}
          selectedDate={selectedDate}
          today={today}
          canCompleteDay={canCompleteDay}
          canPlanDay={canPlanDay}
          selectedOutsidePhase={Boolean(outsidePhase)}
          readOnly={readOnly}
          dayPlanItems={dayPlanItems}
          dayDetail={dayDetail}
          homeSubjects={homeSubjects}
          phaseTopicIds={currentPhaseTopicIds}
          completionDates={completionDates}
          planTopicDragEnabled={
            planTopicDragEnabled && selectedDate >= today && canPlanDay
          }
          planDropHighlighted={dragOverDate === selectedDate}
          onCalendarStatsChange={syncCalendarStats}
          onEditTopic={(topicId) => setTopicEditId(topicId)}
        />
      </div>
    </div>
  );

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{objectiveName}</h1>
            <p className="font-mono text-xs text-[var(--text-muted)]">
              {readOnly ? "archived · read-only" : "active workspace"} · {objectiveStart} →{" "}
              {objectiveEnd}
            </p>
          </div>
          {!readOnly && (
            <div className="flex flex-col items-end gap-1">
              {canEditPhase ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setPhaseModalMode("edit")}
                >
                  Edit phase
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary disabled:opacity-40"
                  disabled={!canSetPhase}
                  onClick={() => setPhaseModalMode("create")}
                >
                  Set phase
                </button>
              )}
            </div>
          )}
        </div>

        {!readOnly && !currentPhase && (
          <div className="rounded-lg border border-[var(--accent-amber)]/40 bg-[var(--bg-muted)] px-4 py-3 text-sm">
            <span className="font-medium text-[var(--accent-amber)]">No active phase.</span>
            <span className="text-[var(--text-muted)]">
              {" "}
              Set a phase to unlock calendar planning.
            </span>
          </div>
        )}

        {planTopicDragEnabled ? (
          <DndContext
            sensors={dragSensors}
            collisionDetection={pointerWithin}
            onDragStart={(event) => {
              setActiveDrag(event.active.data.current as PlanTopicDragData);
            }}
            onDragOver={handlePlanTopicDragOver}
            onDragEnd={handlePlanTopicDragEnd}
            onDragCancel={clearPlanTopicDrag}
          >
            {calendarAndDayPanel}

            <div className="card p-4">
              <PhaseTargetsTable
                subjects={homeSubjects}
                phaseTopicIds={currentPhaseTopicIds}
                currentPhaseId={currentPhase?.id ?? null}
                readOnly={readOnly}
                completionDates={completionDates}
                phaseScheduleByTopic={phaseScheduleByTopic}
                today={today}
                phaseScheduleDragEnabled={planTopicDragEnabled}
                objectiveId={objectiveId}
                objectiveStart={objectiveStart}
                objectiveEnd={objectiveEnd}
                phaseStart={currentPhase?.startDate ?? null}
                phaseEnd={currentPhase?.endDate ?? null}
                calendarDays={calendarDayStats}
              />
            </div>

            <DragOverlay dropAnimation={null} style={{ zIndex: 9999 }}>
              {activeDrag ? (
                <PlanTopicDragPreview
                  title={activeDrag.topicTitle}
                  subjectName={activeDrag.subjectName}
                  subjectColor={activeDrag.subjectColor}
                  weightLabel={activeDrag.weightLabel}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <>
            {calendarAndDayPanel}
            <div className="card p-4">
              <PhaseTargetsTable
                subjects={homeSubjects}
                phaseTopicIds={currentPhaseTopicIds}
                currentPhaseId={currentPhase?.id ?? null}
                readOnly={readOnly}
                completionDates={completionDates}
                phaseScheduleByTopic={phaseScheduleByTopic}
                today={today}
                objectiveId={objectiveId}
                objectiveStart={objectiveStart}
                objectiveEnd={objectiveEnd}
                phaseStart={currentPhase?.startDate ?? null}
                phaseEnd={currentPhase?.endDate ?? null}
                calendarDays={calendarDayStats}
              />
            </div>
          </>
        )}

      </div>

      <ConfirmModal
        open={Boolean(scheduleConfirm)}
        title={
          scheduleConfirm?.discardTodayProgress
            ? "Move plan and clear today's progress?"
            : "Move scheduled topic here?"
        }
        description={
          scheduleConfirm
            ? scheduleConfirm.discardTodayProgress
              ? `“${scheduleConfirm.topicTitle}” is on today with logged work. Moving it to ${scheduleConfirm.toDate} clears today's checks (past logs stay locked).`
              : `“${scheduleConfirm.topicTitle}” is already planned on ${scheduleConfirm.conflictDates.join(", ")}. Move it to ${scheduleConfirm.toDate}?`
            : ""
        }
        confirmLabel={
          scheduleConfirm?.discardTodayProgress ? "Clear and move" : "Move here"
        }
        danger={Boolean(scheduleConfirm?.discardTodayProgress)}
        pending={movePending}
        onClose={() => setScheduleConfirm(null)}
        onConfirm={() => {
          if (!scheduleConfirm) return;
          setMovePending(true);
          startTransition(async () => {
            try {
              await scheduleTopicOnDay(
                objectiveId,
                scheduleConfirm.toDate,
                scheduleConfirm.topicId,
                true,
              );
              const d = scheduleConfirm.toDate;
              setScheduleConfirm(null);
              if (d === today) {
                setSelectedDate(today);
                router.push(`/?date=${today}`);
              }
              refresh();
            } catch (e) {
              setMoveError(e instanceof Error ? e.message : "Could not schedule");
            } finally {
              setMovePending(false);
            }
          });
        }}
      />

      <ConfirmModal
        open={Boolean(moveConfirm)}
        title={
          moveConfirm?.discardTodayProgress
            ? "Reschedule and clear today's progress?"
            : "Reschedule topic?"
        }
        description={
          moveConfirm
            ? moveConfirm.discardTodayProgress
              ? `Move “${moveConfirm.topicTitle}” from ${moveConfirm.fromDate ?? today} to ${moveConfirm.toDate}? You already logged work on this topic today — that progress will be cleared (not moved). Past completions stay locked.${moveError ? ` ${moveError}` : ""}`
              : `Move “${moveConfirm.topicTitle}” from ${moveConfirm.fromDate ?? today} to ${moveConfirm.toDate}?${moveError ? ` ${moveError}` : ""}`
            : ""
        }
        confirmLabel={moveConfirm?.discardTodayProgress ? "Clear and reschedule" : "Reschedule"}
        danger={Boolean(moveConfirm?.discardTodayProgress)}
        pending={movePending}
        onClose={() => {
          setMoveConfirm(null);
          setMoveError(null);
        }}
        onConfirm={async () => {
          if (!moveConfirm) return;
          setMovePending(true);
          setMoveError(null);
          try {
            const sourceDate = moveConfirm.fromDate ?? selectedDate;
            await moveTopicPlanToDay(
              objectiveId,
              sourceDate,
              moveConfirm.toDate,
              moveConfirm.topicId,
            );
            setMoveConfirm(null);
            if (selectedDate !== sourceDate) {
              setSelectedDate(sourceDate);
            }
            router.push(`/?date=${sourceDate}`);
            refresh();
          } catch (e) {
            setMoveError(e instanceof Error ? e.message : "Could not move topic");
          } finally {
            setMovePending(false);
          }
        }}
      />
      <TopicEditModal
        open={Boolean(topicEditId && editingTopicFromHome)}
        subjects={syllabusSubjectsForEdit}
        edit={editingTopicFromHome}
        readOnly={readOnly}
        volatileToday={volatileToday}
        onClose={() => setTopicEditId(null)}
        onRefresh={() => refresh()}
        onRequestDelete={(topic) => {
          setTopicEditId(null);
          setTopicDeleteConfirm(topic);
        }}
        onSaved={() => {
          setTopicEditId(null);
          refresh();
        }}
      />

      <DangerousTopicDeleteModal
        open={Boolean(topicDeleteConfirm)}
        topicTitle={topicDeleteConfirm?.title ?? ""}
        impact={
          topicDeleteConfirm
            ? topicDeleteImpact(topicDeleteConfirm, topicDeleteConfirm.subtopics, {
                inPhase: currentPhaseTopicIds.includes(topicDeleteConfirm.id),
              })
            : null
        }
        pending={topicEditPending}
        onClose={() => setTopicDeleteConfirm(null)}
        onConfirm={() => {
          if (!topicDeleteConfirm) return;
          startTopicEditTransition(async () => {
            await deleteTopic(topicDeleteConfirm.id);
            setTopicDeleteConfirm(null);
            refresh();
          });
        }}
      />

      {phaseModalMode && (
        <PhaseModal
          mode={phaseModalMode}
          objectiveId={objectiveId}
          objectiveStart={objectiveStart}
          objectiveEnd={objectiveEnd}
          today={today}
          homeSubjects={homeSubjects}
          pendingPhaseTopicIds={pendingPhaseTopicIds}
          completionDates={completionDates}
          initialPhase={currentPhase}
          initialTopicIds={currentPhaseTopicIds}
          onClose={() => setPhaseModalMode(null)}
          onSaved={() => {
            setPhaseModalMode(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function phaseTopicsLoggedOnDay(
  topicIds: Set<string>,
  homeSubjects: HomeSubject[],
  completionDates: CompletionDates,
  day: string,
): boolean {
  for (const subject of homeSubjects) {
    for (const topic of subject.topics) {
      if (!topicIds.has(topic.id)) continue;
      if (topic.subtopics.length === 0) {
        if (completionDates.byTopicId[topic.id] === day) return true;
      } else {
        for (const sub of topic.subtopics) {
          if (completionDates.bySubtopicId[sub.id] === day) return true;
        }
      }
    }
  }
  return false;
}

function PhaseModal({
  mode,
  objectiveId,
  objectiveStart,
  objectiveEnd,
  today,
  homeSubjects,
  pendingPhaseTopicIds,
  completionDates,
  initialPhase,
  initialTopicIds,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  objectiveId: string;
  objectiveStart: string;
  objectiveEnd: string;
  today: string;
  homeSubjects: HomeSubject[];
  pendingPhaseTopicIds: string[];
  completionDates: CompletionDates;
  initialPhase: { name: string; startDate: string; endDate: string } | null;
  initialTopicIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { completionDates: liveCompletionDates } = useCompletionDates();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(mode === "edit" && initialPhase ? initialPhase.name : "Sprint");
  const [start, setStart] = useState<DateString>(
    mode === "edit" && initialPhase ? initialPhase.startDate : today,
  );
  const [end, setEnd] = useState<DateString>(
    mode === "edit" && initialPhase ? initialPhase.endDate : objectiveEnd,
  );
  const [carryoverSelected, setCarryoverSelected] = useState<Set<string>>(
    () => new Set(pendingPhaseTopicIds),
  );
  const phaseTopicIds = useMemo(() => new Set(initialTopicIds), [initialTopicIds]);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isCreate = mode === "create";
  const createTopicIds = useMemo(
    () => (isCreate ? [...carryoverSelected] : initialTopicIds),
    [isCreate, carryoverSelected, initialTopicIds],
  );

  const carryoverRows = useMemo(() => {
    const pending = new Set(pendingPhaseTopicIds);
    const rows: { id: string; title: string; subjectName: string }[] = [];
    for (const subject of homeSubjects) {
      for (const topic of subject.topics) {
        if (!pending.has(topic.id)) continue;
        rows.push({ id: topic.id, title: topic.title, subjectName: subject.name });
      }
    }
    for (const id of pendingPhaseTopicIds) {
      if (rows.some((r) => r.id === id)) continue;
      rows.push({ id, title: id, subjectName: "—" });
    }
    return rows;
  }, [homeSubjects, pendingPhaseTopicIds]);

  const editPhaseStartMin = useMemo((): DateString => {
    if (!initialPhase) return objectiveStart as DateString;
    const floor = minDateString(today as DateString, initialPhase.startDate as DateString);
    return maxDateString(objectiveStart as DateString, floor);
  }, [initialPhase, objectiveStart, today]);

  function submitPhase() {
    startTransition(async () => {
      try {
        setError(null);
        const topicIds = isCreate ? createTopicIds : initialTopicIds;
        if (isCreate) {
          await createPhase(objectiveId, {
            name,
            startDate: start,
            endDate: end,
            topicIds,
          });
        } else {
          await updateCurrentPhase(objectiveId, {
            name,
            startDate: start,
            endDate: end,
            topicIds,
          });
        }
        setConfirmOpen(false);
        onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
        setConfirmOpen(false);
      }
    });
  }

  const topicCount = isCreate ? createTopicIds.length : initialTopicIds.length;
  const phaseDays = start && end ? inclusiveDayCount(start, end) : 0;
  const objectiveEndDate = objectiveEnd as DateString;
  const phaseStartMax = maxPhaseStartDate(objectiveEndDate);
  const startTooLate =
    start !== "" && !hasRoomForMinPhase(start, objectiveEndDate);
  const endLocked =
    start !== "" && phaseEndLockedToCycle(start, objectiveEndDate);
  const phaseTooShort =
    startTooLate || (start !== "" && end !== "" && phaseDays < MIN_PHASE_DAYS);

  useEffect(() => {
    if (!start) return;
    if (endLocked) {
      if (end !== objectiveEnd) setEnd(objectiveEnd as DateString);
      return;
    }
    if (end && phaseEndLeavesShortRemainder(end, objectiveEnd as DateString)) {
      setEnd(objectiveEnd as DateString);
    }
  }, [start, end, endLocked, objectiveEnd]);

  const startMovedLater =
    !isCreate && initialPhase != null && start > initialPhase.startDate;
  const todayOutsideNewPhase = today < start || today > end;
  const todayWorkOnPhaseTopics =
    !isCreate &&
    phaseTopicsLoggedOnDay(phaseTopicIds, homeSubjects, liveCompletionDates, today);

  const confirmDanger =
    !isCreate &&
    (today < start || (today > end && todayWorkOnPhaseTopics));

  const confirmDescription = isCreate
    ? topicCount > 0
      ? `Start focus window “${name.trim()}” from ${start} to ${end} with ${topicCount} topic(s)?`
      : `Start an empty focus window “${name.trim()}” from ${start} to ${end}? Add topics from Phase targets when you're ready.`
    : [
        `Save changes to phase “${name.trim()}” (${start} → ${end}, ${topicCount} topic(s))?`,
        startMovedLater
          ? `The phase start moves from ${initialPhase!.startDate} to ${start}. Plans on days that no longer fall in the sprint will be removed — those topics return to Phase targets. Logged work on past days is kept.`
          : null,
        todayOutsideNewPhase
          ? [
              today < start
                ? `The new start is after today (${today}). Anything you checked off or planned for today on these phase topics will be cleared.`
                : null,
              today > end
                ? `The new end is before today (${today}). Today's checks, notes, and plans on these phase topics will be cleared.`
                : null,
            ]
              .filter(Boolean)
              .join("\n\n")
          : null,
      ]
        .filter(Boolean)
        .join("\n\n");

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <div className="card w-full max-w-md p-4">
          <h2 className="text-lg font-semibold">{isCreate ? "New phase" : "Edit phase"}</h2>
          {isCreate && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {carryoverRows.length > 0
                ? "Incomplete topics from your last phase are included below. Uncheck any you do not want in this sprint."
                : "No incomplete topics carried over. You can start an empty phase and add topics later from Phase targets."}
            </p>
          )}
          <div className="mt-4 space-y-3">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Phase name"
            />
            {isCreate ? (
              <DateRangePickers
                start={start}
                end={end}
                onStartChange={setStart}
                onEndChange={setEnd}
                min={today as DateString}
                max={minDateString(phaseStartMax, objectiveEndDate)}
                minSpanDays={MIN_PHASE_DAYS}
                cycleEndDate={objectiveEndDate}
                endLockedToCycle={endLocked}
                isEndDateDisabled={(d) =>
                  phaseEndLeavesShortRemainder(d, objectiveEndDate)
                }
                endLegendExtra={[
                  `Latest start for a ${MIN_PHASE_DAYS}-day phase: ${phaseStartMax}.`,
                  "Crossed-out amber days are too short for a phase.",
                  "Faded red days would leave 1–6 days in the cycle — pick cycle end instead.",
                ]}
                startLabel="Phase start"
                endLabel="Phase end"
              />
            ) : (
              <DateRangePickers
                start={start}
                end={end}
                onStartChange={setStart}
                onEndChange={setEnd}
                min={editPhaseStartMin}
                max={minDateString(phaseStartMax, objectiveEndDate)}
                minSpanDays={MIN_PHASE_DAYS}
                cycleEndDate={objectiveEndDate}
                endLockedToCycle={endLocked}
                isEndDateDisabled={(d) =>
                  phaseEndLeavesShortRemainder(d, objectiveEnd)
                }
                endLegendExtra={[
                  `Latest start for a ${MIN_PHASE_DAYS}-day phase: ${phaseStartMax}.`,
                  "Crossed-out amber days are too short for a phase.",
                  "Faded red days would leave 1–6 days in the cycle — pick cycle end instead.",
                ]}
                startLabel="Phase start"
                endLabel="Phase end"
              />
            )}
            <p
              className={
                phaseTooShort
                  ? "text-xs text-[var(--danger)]"
                  : "text-xs text-[var(--text-muted)]"
              }
            >
              {startTooLate
                ? `This start leaves only ${inclusiveDayCount(start, objectiveEndDate)} day(s) until the cycle ends. A phase needs ${MIN_PHASE_DAYS} — start on or before ${phaseStartMax}.`
                : endLocked
                  ? `Ending earlier would leave less than a week in the cycle, so this phase runs through ${objectiveEnd}.`
                  : phaseTooShort
                    ? `This range is ${phaseDays} day${phaseDays === 1 ? "" : "s"}. A phase must last at least ${MIN_PHASE_DAYS} days.`
                    : `At least ${MIN_PHASE_DAYS} days. An end that would leave 1–6 days in the cycle is not available.`}
            </p>
            {isCreate && carryoverRows.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded border border-[var(--border)] p-2">
                {carryoverRows.map((t) => (
                  <label key={t.id} className="flex gap-2 py-0.5 text-xs">
                    <input
                      type="checkbox"
                      checked={carryoverSelected.has(t.id)}
                      onChange={(e) => {
                        const next = new Set(carryoverSelected);
                        if (e.target.checked) next.add(t.id);
                        else next.delete(t.id);
                        setCarryoverSelected(next);
                      }}
                    />
                    <span>{t.title}</span>
                    <span className="text-[var(--text-muted)]">({t.subjectName})</span>
                  </label>
                ))}
              </div>
            )}
            {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn" onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary disabled:opacity-40"
              disabled={pending || phaseTooShort}
              onClick={() => setConfirmOpen(true)}
            >
              {isCreate ? "Review & create" : "Review & save"}
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title={isCreate ? "Create this phase?" : "Save phase changes?"}
        description={confirmDescription}
        confirmLabel={isCreate ? "Create phase" : "Save changes"}
        danger={confirmDanger}
        pending={pending}
        onClose={() => setConfirmOpen(false)}
        onConfirm={submitPhase}
      />
    </>
  );
}
