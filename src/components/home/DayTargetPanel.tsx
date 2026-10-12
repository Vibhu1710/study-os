"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { unscheduleTopicFromDay, upsertDayNote } from "@/lib/actions/day";
import { togglePlanItemComplete, updateSubtopic, updateTopic } from "@/lib/actions/topics";
import {
  leafTopicVisibleOnPastDay,
  subtopicRowDisplay,
} from "@/lib/day-plan-rows";
import { topicTotalWeight } from "@/lib/progress";
import type { CompletionDates } from "@/lib/completion-dates";
import { useCompletionDates } from "@/lib/completion-dates-context";
import type { HomeSubject } from "@/components/home/PhaseTargetsTable";
import {
  DraggablePlanTopicCard,
  DroppableDayTargetPanel,
} from "@/components/home/PlanTopicDragDrop";
import { cn } from "@/lib/cn";

type PlanItem = {
  id: string;
  topicId: string;
  subtopicId: string | null;
  topic: {
    title: string;
    weight: number;
    completedAt: string | null;
    subject: { name: string; color: string };
    notes?: string | null;
    subtopics: {
      id: string;
      title: string;
      weight: number;
      completedAt: string | null;
      notes?: string | null;
    }[];
  };
  subtopic?: {
    id: string;
    title: string;
    weight: number;
    completedAt: string | null;
    notes?: string | null;
  } | null;
};

type DayDetail = {
  events: {
    id: string;
    topicId: string;
    subtopicId: string | null;
    weightSnapshot: number;
    topic: { title: string };
    subtopic: { id: string; title: string } | null;
  }[];
  notes: {
    topicId: string;
    subtopicId: string | null;
    body: string;
  }[];
  dayNote?: string | null;
};

type TopicGroup = {
  topicId: string;
  title: string;
  subjectName: string;
  subjectColor: string;
  items: PlanItem[];
  topic: PlanItem["topic"];
  hasLivePlan: boolean;
};

function isHistoryPlanItem(id: string) {
  return id.startsWith("history-");
}

export function DayTargetPanel({
  objectiveId,
  selectedDate,
  today,
  canCompleteDay,
  canPlanDay,
  selectedOutsidePhase = false,
  readOnly,
  dayPlanItems,
  dayDetail,
  homeSubjects,
  completionDates: _serverCompletionDates,
  planTopicDragEnabled = false,
  planDropHighlighted = false,
  onCalendarStatsChange,
  onEditTopic,
}: {
  objectiveId: string;
  selectedDate: string;
  today: string;
  canCompleteDay: boolean;
  canPlanDay: boolean;
  selectedOutsidePhase?: boolean;
  readOnly: boolean;
  dayPlanItems: PlanItem[];
  dayDetail: DayDetail;
  homeSubjects: HomeSubject[];
  phaseTopicIds: string[];
  completionDates: CompletionDates;
  planTopicDragEnabled?: boolean;
  planDropHighlighted?: boolean;
  onCalendarStatsChange?: () => void | Promise<void>;
  onEditTopic?: (topicId: string) => void;
}) {
  const router = useRouter();
  const { completionDates, patchPlanToggle } = useCompletionDates();
  const [pending, startTransition] = useTransition();
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [editingNoteTopicId, setEditingNoteTopicId] = useState<string | null>(null);
  const [editingNoteSubtopicId, setEditingNoteSubtopicId] = useState<string | null>(
    null,
  );
  const [editingDayNote, setEditingDayNote] = useState(false);
  const dayNoteKey = `day:${selectedDate}`;
  const dayNoteBody = noteDrafts[dayNoteKey] ?? dayDetail.dayNote ?? "";

  useEffect(() => {
    setEditingDayNote(false);
  }, [selectedDate]);

  const topicCatalog = useMemo(() => {
    const map = new Map<
      string,
      { notes: string | null; subtopics: HomeSubject["topics"][0]["subtopics"] }
    >();
    for (const subject of homeSubjects) {
      for (const topic of subject.topics) {
        map.set(topic.id, { notes: topic.notes, subtopics: topic.subtopics });
      }
    }
    return map;
  }, [homeSubjects]);

  const isFuture = selectedDate > today;
  const isToday = selectedDate === today;
  const isPast = selectedDate < today;

  const subtopicsByTopicId = useMemo(() => {
    const map = new Map<string, PlanItem["topic"]["subtopics"]>();
    for (const subject of homeSubjects) {
      for (const topic of subject.topics) {
        map.set(topic.id, topic.subtopics);
      }
    }
    return map;
  }, [homeSubjects]);

  function resolveSubtopics(topicId: string, topic: PlanItem["topic"]) {
    if (topic.subtopics.length > 0) return topic.subtopics;
    return subtopicsByTopicId.get(topicId) ?? [];
  }

  const groups = useMemo(() => {
    const byTopic = new Map<string, TopicGroup>();
    for (const item of dayPlanItems) {
      let g = byTopic.get(item.topicId);
      if (!g) {
        g = {
          topicId: item.topicId,
          title: item.topic.title,
          subjectName: item.topic.subject.name,
          subjectColor: item.topic.subject.color,
          items: [],
          topic: item.topic,
          hasLivePlan: false,
        };
        byTopic.set(item.topicId, g);
      }
      g.items.push(item);
      if (!isHistoryPlanItem(item.id)) g.hasLivePlan = true;
    }
    return [...byTopic.values()].filter((g) =>
      leafTopicVisibleOnPastDay(
        resolveSubtopics(g.topicId, g.topic).length > 0,
        selectedDate,
        g.topicId,
        completionDates,
        today,
      ),
    );
  }, [dayPlanItems, selectedDate, completionDates, today, subtopicsByTopicId]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  function topicNotesFor(topicId: string, fallback?: string | null) {
    return topicCatalog.get(topicId)?.notes ?? fallback ?? null;
  }

  function subtopicNotesFor(topicId: string, subtopicId: string) {
    const subs = subtopicsByTopicId.get(topicId) ?? topicCatalog.get(topicId)?.subtopics;
    return subs?.find((s) => s.id === subtopicId)?.notes ?? null;
  }

  async function toggleRowComplete(
    topicId: string,
    subtopicId: string | null,
    currentlyDone: boolean,
  ) {
    if (!isToday || !canCompleteDay || readOnly) return;
    const complete = !currentlyDone;
    patchPlanToggle({ topicId, subtopicId, complete });
    try {
      await togglePlanItemComplete(topicId, subtopicId, selectedDate, complete);
      void onCalendarStatsChange?.();
    } catch {
      patchPlanToggle({ topicId, subtopicId, complete: currentlyDone });
      refresh();
    }
  }

  const canEditToday =
    isToday && canCompleteDay && !readOnly && !pending;
  const canEditDayNote = !readOnly && !pending;
  const canManagePlan = canPlanDay && !isPast && !readOnly && !pending;
  const showPlanUi = !isPast && canPlanDay && !selectedOutsidePhase;

  const panelTitle = isToday
    ? "Today's target"
    : isPast
      ? `Log · ${selectedDate}`
      : showPlanUi
        ? `Plan · ${selectedDate}`
        : selectedDate;

  const panelSubtitle = (() => {
    if (selectedOutsidePhase && isToday) {
      return "Today falls outside the current phase. Switch to an in-phase day to plan or log against the sprint.";
    }
    if (selectedOutsidePhase && isPast) {
      return "Read-only log for this day (outside the current phase).";
    }
    if (selectedOutsidePhase && !isPast) {
      return "Outside the current phase. Future days here can’t be planned; pick a date within the sprint on the calendar.";
    }
    if (showPlanUi && planTopicDragEnabled) {
      return "Drag phase topics here or onto the calendar.";
    }
    if (isToday) {
      return "Check or uncheck today's work. Past logs are locked after midnight.";
    }
    return "Read-only log — what was completed on this day.";
  })();

  function renderTopicCardActions(topicId: string, showRemove: boolean) {
    const showEdit = Boolean(onEditTopic);
    if (!showEdit && !(showRemove && canManagePlan)) return null;
    return (
      <div className="flex shrink-0 items-center gap-1">
        {showEdit && (
          <button
            type="button"
            className="btn inline-flex h-[22px] min-w-[26px] items-center justify-center px-1.5 py-0.5 text-[9px] leading-none"
            aria-label="Edit topic"
            title="Edit topic"
            disabled={pending}
            onClick={() => onEditTopic!(topicId)}
          >
            <Pencil className="h-3 w-3" aria-hidden />
          </button>
        )}
        {showRemove && canManagePlan && (
          <button
            type="button"
            className="btn btn-trash inline-flex h-[22px] min-w-[26px] items-center justify-center px-1.5 py-0.5 text-[9px] leading-none"
            aria-label="Remove from this day"
            title="Remove from this day"
            disabled={pending}
            onClick={async () => {
              await unscheduleTopicFromDay(objectiveId, selectedDate, topicId);
              refresh();
            }}
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        )}
      </div>
    );
  }

  function subjectRowHighlightStyle(color: string): CSSProperties {
    return {
      backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 35%, transparent)`,
    };
  }

  function renderCompletionControl(
    label: string,
    display: ReturnType<typeof subtopicRowDisplay>,
    onToggle: () => void,
    subjectColor: string,
    tickTitle?: string,
  ) {
    const d = display;
    if (d.showCheckbox) {
      return (
        <input
          type="checkbox"
          className="mt-0.5"
          style={{ accentColor: subjectColor }}
          checked={d.checkboxChecked}
          aria-label={
            d.checkboxChecked
              ? `Mark ${label} incomplete for today`
              : `Mark ${label} complete for today`
          }
          onChange={onToggle}
        />
      );
    }
    if (d.showPastTick || d.loggedOnViewDay) {
      return (
        <span
          className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center"
          style={{ color: subjectColor }}
          aria-label={`${label} completed`}
          title={tickTitle}
        >
          ✓
        </span>
      );
    }
    return (
      <span className="mt-0.5 inline-block w-4 shrink-0 text-center text-[var(--text-muted)]">
        —
      </span>
    );
  }

  return (
    <DroppableDayTargetPanel
      date={selectedDate}
      enabled={planTopicDragEnabled && showPlanUi}
      dropHighlighted={planDropHighlighted}
      className="card flex h-full min-h-full flex-col p-4"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border)] pb-3">
        <div>
          <h3 className="font-medium">{panelTitle}</h3>
          {panelSubtitle ? (
            <p className="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">
              {panelSubtitle}
            </p>
          ) : null}
        </div>
      </div>

      {(dayNoteBody.trim().length > 0 || canEditDayNote) && (
        <div className="mb-3 border-b border-[var(--border)] pb-3">
          <p className="font-mono text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
            Day notes
          </p>
          {editingDayNote && canEditDayNote ? (
            <textarea
              className="input mt-1.5 min-h-[56px] text-xs"
              value={dayNoteBody}
              autoFocus
              disabled={pending}
              placeholder="Anything extra for this day — not tied to a topic…"
              onChange={(e) =>
                setNoteDrafts((d) => ({ ...d, [dayNoteKey]: e.target.value }))
              }
              onBlur={async () => {
                await upsertDayNote({
                  objectiveId,
                  date: selectedDate,
                  body: dayNoteBody,
                });
                setEditingDayNote(false);
                refresh();
              }}
            />
          ) : dayNoteBody.trim() ? (
            <p
              className={cn(
                "mt-1.5 text-xs leading-relaxed text-[var(--text-muted)] whitespace-pre-wrap",
                canEditDayNote && "cursor-text",
              )}
              title={canEditDayNote ? "Double-click to edit" : undefined}
              onDoubleClick={() => {
                if (!canEditDayNote) return;
                setEditingDayNote(true);
              }}
            >
              {dayNoteBody.trim()}
            </p>
          ) : canEditDayNote ? (
            <button
              type="button"
              className="mt-1.5 block text-left text-xs text-[var(--accent)]"
              onClick={() => setEditingDayNote(true)}
            >
              Add day note
            </button>
          ) : null}
        </div>
      )}

      {groups.length === 0 ? (
        <p className="flex-1 text-xs text-[var(--text-muted)]">
          {selectedOutsidePhase && !isPast
            ? "Outside the current phase — pick an in-phase day to plan."
            : showPlanUi && planTopicDragEnabled
              ? "Nothing scheduled yet."
              : "No activity for this day."}
        </p>
      ) : (
        <div className="flex-1 space-y-4 pr-1">
          {groups.map((group) => {
            const topicSubtopics = resolveSubtopics(group.topicId, group.topic);
            const isLeafTopic = topicSubtopics.length === 0;
            const canEditGroup =
              canEditToday && (group.hasLivePlan || group.items.length > 0);
            const leafDoneOn = completionDates.byTopicId[group.topicId] ?? null;
            const leafDisplay = isLeafTopic
              ? subtopicRowDisplay(leafDoneOn, {
                  viewDate: selectedDate,
                  today,
                  isToday,
                  isPast,
                  canEdit: canEditGroup,
                })
              : null;

            const canEditNotes = !readOnly && group.hasLivePlan && !pending;

            const rows: {
              key: string;
              label: string;
              weight: number;
              subtopicId: string;
              notes: string | null;
              display: ReturnType<typeof subtopicRowDisplay>;
            }[] = !isLeafTopic
              ? topicSubtopics.map((sub) => {
                  const doneOn = completionDates.bySubtopicId[sub.id] ?? null;
                  return {
                    key: sub.id,
                    label: sub.title,
                    weight: sub.weight,
                    subtopicId: sub.id,
                    notes: sub.notes ?? subtopicNotesFor(group.topicId, sub.id),
                    display: subtopicRowDisplay(doneOn, {
                      viewDate: selectedDate,
                      today,
                      isToday,
                      isPast,
                      canEdit: canEditGroup,
                    }),
                  };
                })
              : [];

            const noteKey = `topic:${group.topicId}`;
            const topicNoteBody =
              noteDrafts[noteKey] ??
              topicNotesFor(group.topicId, group.topic.notes) ??
              "";

            const dragEnabled =
              planTopicDragEnabled && !isPast && !readOnly && group.hasLivePlan;

            return (
              <DraggablePlanTopicCard
                key={group.topicId}
                topicId={group.topicId}
                topicTitle={group.title}
                fromDate={selectedDate}
                subjectName={group.subjectName}
                subjectColor={group.subjectColor}
                weightLabel={`${topicTotalWeight(group.topic, topicSubtopics)} wt`}
                disabled={!dragEnabled}
                className="rounded-lg border border-[var(--border)]"
                style={{ borderLeftWidth: 3, borderLeftColor: group.subjectColor }}
              >
                {isLeafTopic && leafDisplay ? (
                  <div
                    className="flex items-start justify-between gap-2 bg-[var(--bg-muted)]/30 px-3 py-2.5"
                    data-leaf-topic
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                      {renderCompletionControl(
                        group.title,
                        leafDisplay,
                        () =>
                          toggleRowComplete(
                            group.topicId,
                            null,
                            leafDisplay.checkboxChecked,
                          ),
                        group.subjectColor,
                        leafDisplay.loggedOnViewDay
                          ? `Logged on ${selectedDate}`
                          : leafDisplay.doneOn
                            ? `Logged on ${leafDisplay.doneOn}`
                            : undefined,
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug">
                          {group.title}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                          {group.subjectName} · {group.topic.weight} wt
                          {!isToday && leafDisplay.loggedLabel
                            ? ` · logged ${leafDisplay.loggedLabel}`
                            : null}
                        </p>
                      </div>
                    </div>
                    {renderTopicCardActions(group.topicId, group.hasLivePlan)}
                  </div>
                ) : (
                  <>
                <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg-muted)]/30 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{group.title}</p>
                    <p className="font-mono text-[10px] text-[var(--text-muted)]">
                      {group.subjectName} · {topicTotalWeight(group.topic, topicSubtopics)} wt
                    </p>
                  </div>
                  {renderTopicCardActions(group.topicId, group.hasLivePlan)}
                </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="font-mono text-[10px] text-[var(--text-muted)]">
                        <th className="w-8 px-2 py-1" />
                        <th className="px-2 py-1 text-left">Subtopic</th>
                        <th className="w-12 px-2 py-1 text-left">Wt</th>
                        <th className="w-24 px-2 py-1 text-left">Logged</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const d = row.display;
                        const highlightRow = d.loggedOnViewDay;

                        return (
                          <tr
                            key={row.key}
                            className={cn("border-t border-[var(--border)]/60")}
                            style={
                              highlightRow
                                ? subjectRowHighlightStyle(group.subjectColor)
                                : undefined
                            }
                          >
                            <td className="px-2 py-1.5">
                              {renderCompletionControl(
                                row.label,
                                d,
                                () =>
                                  toggleRowComplete(
                                    group.topicId,
                                    row.subtopicId,
                                    d.checkboxChecked,
                                  ),
                                group.subjectColor,
                                d.loggedOnViewDay
                                  ? `Logged on ${selectedDate}`
                                  : d.doneOn
                                    ? `Logged on ${d.doneOn}`
                                    : undefined,
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="min-w-0">
                              <span
                                className={cn(
                                  "block leading-snug",
                                  highlightRow && "font-medium text-[var(--text)]",
                                )}
                              >
                                {row.label}
                              </span>
                              {(() => {
                                const subNoteKey = `sub:${group.topicId}:${row.subtopicId}`;
                                const subNoteBody =
                                  noteDrafts[subNoteKey] ?? row.notes ?? "";
                                const subNoteText = subNoteBody.trim();
                                const editingSub =
                                  editingNoteSubtopicId === row.subtopicId;
                                const showSubNote =
                                  subNoteText.length > 0 ||
                                  (canEditNotes && group.hasLivePlan);
                                if (!showSubNote) return null;

                                async function saveSubNote() {
                                  if (!canEditNotes) return;
                                  const body =
                                    noteDrafts[subNoteKey] ?? subNoteBody;
                                  await updateSubtopic(row.subtopicId, {
                                    notes: body.trim() || null,
                                  });
                                  setEditingNoteSubtopicId(null);
                                  refresh();
                                }

                                if (editingSub && canEditNotes) {
                                  return (
                                    <textarea
                                      className="input mt-1 min-h-[40px] w-full text-[10px]"
                                      value={subNoteBody}
                                      autoFocus
                                      disabled={pending}
                                      onChange={(e) =>
                                        setNoteDrafts((d) => ({
                                          ...d,
                                          [subNoteKey]: e.target.value,
                                        }))
                                      }
                                      onBlur={() => void saveSubNote()}
                                      placeholder="Subtopic note…"
                                    />
                                  );
                                }
                                if (subNoteText) {
                                  return (
                                    <p
                                      className={cn(
                                        "mt-1 text-[10px] leading-relaxed text-[var(--text-muted)] whitespace-pre-wrap",
                                        canEditNotes && "cursor-text",
                                      )}
                                      title={
                                        canEditNotes ? "Double-click to edit" : undefined
                                      }
                                      onDoubleClick={() => {
                                        if (!canEditNotes) return;
                                        setEditingNoteSubtopicId(row.subtopicId);
                                      }}
                                    >
                                      {subNoteText}
                                    </p>
                                  );
                                }
                                if (canEditNotes) {
                                  return (
                                    <button
                                      type="button"
                                      className="mt-1 block text-left text-[10px] text-[var(--accent)]"
                                      onClick={() =>
                                        setEditingNoteSubtopicId(row.subtopicId)
                                      }
                                    >
                                      Add note
                                    </button>
                                  );
                                }
                                return null;
                              })()}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 font-mono">{row.weight}</td>
                            <td className="px-2 py-1.5 font-mono text-[10px]">
                              {d.loggedLabel || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </>
                )}
                {(() => {
                  const noteText = topicNoteBody.trim();
                  const isEditingNote = editingNoteTopicId === group.topicId;
                  const showNoteFooter =
                    group.hasLivePlan &&
                    (noteText.length > 0 || canEditNotes);

                  if (!showNoteFooter) return null;

                  async function saveNote() {
                    if (!canEditNotes) return;
                    const body = noteDrafts[noteKey] ?? topicNoteBody;
                    await updateTopic(group.topicId, {
                      notes: body.trim() || null,
                    });
                    setEditingNoteTopicId(null);
                    refresh();
                  }

                  return (
                    <div className="border-t border-[var(--border)] px-3 py-2">
                      {isEditingNote && canEditNotes ? (
                        <textarea
                          className="input min-h-[52px] text-xs"
                          value={topicNoteBody}
                          autoFocus
                          disabled={pending}
                          onChange={(e) =>
                            setNoteDrafts((d) => ({ ...d, [noteKey]: e.target.value }))
                          }
                          onBlur={() => void saveNote()}
                          placeholder="Topic note…"
                        />
                      ) : noteText ? (
                        <p
                          className={cn(
                            "text-[10px] leading-relaxed text-[var(--text-muted)] whitespace-pre-wrap",
                            canEditNotes && "cursor-text",
                          )}
                          title={canEditNotes ? "Double-click to edit" : undefined}
                          onDoubleClick={() => {
                            if (!canEditNotes) return;
                            setEditingNoteTopicId(group.topicId);
                          }}
                        >
                          {noteText}
                        </p>
                      ) : canEditNotes ? (
                        <button
                          type="button"
                          className="text-[10px] text-[var(--accent)]"
                          onClick={() => setEditingNoteTopicId(group.topicId)}
                        >
                          Add note
                        </button>
                      ) : null}
                    </div>
                  );
                })()}
              </DraggablePlanTopicCard>
            );
          })}
        </div>
      )}
    </DroppableDayTargetPanel>
  );
}
