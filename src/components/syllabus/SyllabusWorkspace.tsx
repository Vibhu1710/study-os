"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { History, Pencil } from "lucide-react";
import type { DayStat } from "@/components/calendar/ContributionCalendar";
import { TopicEditLogModal } from "@/components/syllabus/TopicEditLogModal";
import type { PhaseBounds } from "@/lib/study-day";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { createSubject, updateSubject } from "@/lib/actions/subjects";
import { SubjectColorField } from "@/components/ui/SubjectColorField";
import {
  DEFAULT_SUBJECT_COLOR,
  normalizeHexColor,
  pickSubjectColor,
} from "@/lib/subject-colors";
import {
  createBacklogItem,
  deleteBacklogItem,
  deleteTopic,
  promoteBacklogItem,
} from "@/lib/actions/topics";
import { TopicEditModal } from "@/components/syllabus/TopicEditModal";
import type {
  SyllabusSubjectBucket as SubjectBucket,
  SyllabusTopic as Topic,
} from "@/components/syllabus/TopicEditModal";
import { topicDeleteImpact } from "@/lib/syllabus-delete";
import { DangerousTopicDeleteModal } from "@/components/syllabus/DangerousTopicDeleteModal";
import { addTopicsToPhase, removeTopicFromPhase } from "@/lib/actions/phases";
import type { CompletionDates } from "@/lib/completion-dates";
import { topicTotalWeight } from "@/lib/progress";
import { useCompletionDates } from "@/lib/completion-dates-context";
import {
  projectedIsTopicComplete,
  projectedTopicProgressPercent,
  dephaseBlockReason,
  topicBlocksDephase,
  volatileKeysFromCompletionDates,
} from "@/lib/progress-projection";
import { rebucketSyllabusSubjects } from "@/lib/syllabus-buckets";
import {
  parsePositiveWeight,
  sanitizeWeightInput,
} from "@/lib/syllabus-weight-input";
import { formatWeightDisplay } from "@/lib/weight";

type ModalKind =
  | { type: "closed" }
  | { type: "subject"; edit?: { id: string; name: string; color: string } }
  | { type: "topic"; subjectId?: string; edit?: Topic }
  | { type: "parking"; subjectId?: string }
  | { type: "promote"; backlogId: string; title: string };

export function SyllabusWorkspace({
  objectiveId,
  readOnly,
  currentPhaseId,
  phaseTopicIds,
  active,
  completed,
  backlogSubjects,
  activeTopicCount: _activeTopicCount,
  subjectCount,
  today: todayProp,
  objectiveStart,
  objectiveEnd,
  phase,
  calendarDays,
  completionDates: _serverCompletionDates,
}: {
  objectiveId: string;
  readOnly: boolean;
  objectiveStart: string;
  objectiveEnd: string;
  phase: PhaseBounds | null;
  calendarDays: Record<string, DayStat>;
  currentPhaseId: string | null;
  phaseTopicIds: string[];
  active: SubjectBucket[];
  completed: SubjectBucket[];
  backlogSubjects: SubjectBucket[];
  activeTopicCount: number;
  subjectCount: number;
  today: string;
  completionDates: CompletionDates;
}) {
  const router = useRouter();
  const { completionDates, today: todayFromCtx } = useCompletionDates();
  const today = todayFromCtx || todayProp;
  const volatileToday = useMemo(
    () => volatileKeysFromCompletionDates(completionDates, today),
    [completionDates, today],
  );
  const {
    active: activeView,
    completed: completedView,
    activeTopicCount: activeTopicCountLive,
    completedTopicCount: completedTopicCountLive,
  } = useMemo(
    () => rebucketSyllabusSubjects(active, completed, volatileToday),
    [active, completed, volatileToday],
  );
  const [tab, setTab] = useState<"active" | "completed">("active");
  const [pending, startTransition] = useTransition();
  const [modal, setModal] = useState<ModalKind>({ type: "closed" });
  const [expandedSubjectIds, setExpandedSubjectIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedTopicIds, setExpandedTopicIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [confirmDelete, setConfirmDelete] = useState<Topic | null>(null);
  const [editLogTopic, setEditLogTopic] = useState<Topic | null>(null);

  const subjects = tab === "active" ? activeView : completedView;
  const subjectIdsKey = useMemo(
    () => subjects.map((s) => s.id).join("|"),
    [subjects],
  );

  useEffect(() => {
    const valid = new Set(subjects.map((s) => s.id));
    setExpandedSubjectIds((prev) => {
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tab, subjectIdsKey, subjects]);

  useEffect(() => {
    setExpandedTopicIds(new Set());
  }, [tab]);

  const editingTopic = useMemo(() => {
    if (modal.type !== "topic" || !modal.edit) return undefined;
    for (const s of [...activeView, ...completedView]) {
      const t = s.topics.find((x) => x.id === modal.edit!.id);
      if (t) return t;
    }
    return modal.edit;
  }, [modal, activeView, completedView]);

  function openTopicEdit(topic: Topic, subjectId: string) {
    setExpandedSubjectIds((prev) => new Set(prev).add(subjectId));
    setModal({ type: "topic", edit: topic, subjectId });
  }

  function toggleSubjectExpand(subjectId: string) {
    setExpandedSubjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });
  }

  function toggleTopicExpand(topicId: string) {
    setExpandedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  }

  const subjectColorsInUse = useMemo(
    () => activeView.map((s) => s.color),
    [activeView],
  );
  const colCount = tab === "completed" ? 5 : 6;
  const completedTopicCount = completedTopicCountLive;
  const activeTopicCountDisplay = activeTopicCountLive;

  function refresh() {
    startTransition(() => router.refresh());
  }

  function requestTopicDelete(topic: Topic) {
    setConfirmDelete(topic);
  }

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Syllabus</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
          One syllabus table per view. Use the toolbar to add subjects and topics in modals —
          parking lot ideas stay separate at the bottom.
        </p>
      </div>

      <section className="card flex flex-col">
        <div className="border-b border-[var(--border)] bg-[var(--bg-muted)]/40 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-mono text-xs uppercase tracking-wider text-[var(--accent)]">
                Official syllabus
              </h2>
              <div
                className="mt-3 inline-flex w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1 sm:w-auto"
                role="tablist"
              >
                <ViewTab
                  id="active"
                  selected={tab === "active"}
                  label="To cover"
                  count={activeTopicCountDisplay}
                  onSelect={() => setTab("active")}
                />
                <ViewTab
                  id="completed"
                  selected={tab === "completed"}
                  label="Completed"
                  count={completedTopicCount}
                  onSelect={() => setTab("completed")}
                />
              </div>
              {readOnly ? (
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  This exam cycle is read-only — topics cannot be deleted.
                </p>
              ) : (
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Deleting a topic asks for confirmation and removes that topic&apos;s plan and
                  logs only.
                </p>
              )}
            </div>
            {!readOnly && tab === "active" && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn" onClick={() => setModal({ type: "subject" })}>
                  + Subject
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    const first = activeView[0];
                    if (first) {
                      setExpandedSubjectIds((prev) => new Set(prev).add(first.id));
                    }
                    setModal({ type: "topic" });
                  }}
                  disabled={subjectCount === 0}
                >
                  + Topic
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--bg-elevated)] font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)] shadow-[0_1px_0_var(--border)]">
              <tr>
                <th className="px-2 py-2.5 w-10 font-medium">#</th>
                <th className="px-4 py-2.5 font-medium">Topic</th>
                <th className="px-2 py-2.5 w-16 font-medium">Wt</th>
                {tab === "active" ? (
                  <>
                    <th className="px-2 py-2.5 min-w-[8.5rem] w-36 font-medium">Progress</th>
                    <th className="px-2 py-2.5 w-24 font-medium">Phase</th>
                  </>
                ) : (
                  <th className="px-2 py-2.5 min-w-[8.5rem] w-36 font-medium">Completed</th>
                )}
                <th
                  className={cn(
                    "w-24 px-2 py-2.5 pl-2 font-medium",
                    tab === "completed" ? "pr-7" : "pr-4",
                  )}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {subjects.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-4 py-12 text-center text-[var(--text-muted)]">
                    {tab === "active"
                      ? "No subjects yet — click + Subject to begin."
                      : "No completed topics yet."}
                  </td>
                </tr>
              )}
              {subjects.map((subject) => {
                const subjectOpen = expandedSubjectIds.has(subject.id);
                return (
                <Fragment key={subject.id}>
                  <tr
                    className={cn(
                      "bg-[var(--bg-muted)]/60 border-b border-[var(--border)]",
                      subjectOpen && "bg-[var(--bg-muted)]",
                    )}
                  >
                    <td colSpan={colCount} className="px-4 py-2 font-medium">
                      <div className="flex items-center gap-2">
                        {!readOnly && tab === "active" ? (
                          <button
                            type="button"
                            className="inline-block h-3 w-3 shrink-0 rounded-sm ring-1 ring-black/25 transition-transform hover:scale-110"
                            style={{ backgroundColor: subject.color }}
                            title="Change subject color"
                            onClick={() =>
                              setModal({
                                type: "subject",
                                edit: {
                                  id: subject.id,
                                  name: subject.name,
                                  color: subject.color,
                                },
                              })
                            }
                          />
                        ) : (
                          <span
                            className="inline-block h-3 w-3 shrink-0 rounded-sm ring-1 ring-black/25"
                            style={{ backgroundColor: subject.color }}
                            aria-hidden
                          />
                        )}
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          aria-expanded={subjectOpen}
                          onClick={() => toggleSubjectExpand(subject.id)}
                        >
                          <span className="font-mono text-[10px] text-[var(--text-muted)] w-3 shrink-0">
                            {subjectOpen ? "▾" : "▸"}
                          </span>
                          <span className="min-w-0 flex-1 font-medium text-[var(--text)]">
                            {subject.name}
                          </span>
                          <span className="font-mono text-[10px] font-normal text-[var(--text-muted)]">
                            {subject.topics.length} topic{subject.topics.length === 1 ? "" : "s"}
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                  {subjectOpen && subject.topics.length === 0 && tab === "active" && (
                    <tr className="border-b border-[var(--border)]">
                      <td colSpan={colCount} className="px-4 py-3 text-xs text-[var(--text-muted)]">
                        No topics —{" "}
                        <button
                          type="button"
                          className="text-[var(--accent)] underline"
                          onClick={() => setModal({ type: "topic", subjectId: subject.id })}
                        >
                          add topic
                        </button>
                      </td>
                    </tr>
                  )}
                  {subjectOpen &&
                  subject.topics.map((topic, topicIndex) => {
                    const inPhase = phaseTopicIds.includes(topic.id);
                    const pct = projectedTopicProgressPercent(
                      topic,
                      topic.subtopics,
                      volatileToday,
                    );
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
                    const serial = topicIndex + 1;
                    const topicExpanded = expandedTopicIds.has(topic.id);
                    const topicDoneDate = syllabusTopicLogDate(
                      topic,
                      completionDates,
                      volatileToday,
                      today,
                    );
                    const hasSubs = topic.subtopics.length > 0;
                    return (
                      <Fragment key={topic.id}>
                        <tr className="border-b border-[var(--border)] hover:bg-[var(--bg-muted)]/30">
                          <td className="px-2 py-2.5 font-mono text-xs text-[var(--text-muted)]">
                            {serial}
                          </td>
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              className="flex w-full min-w-0 items-start gap-2 text-left"
                              aria-expanded={hasSubs ? topicExpanded : undefined}
                              onClick={() => {
                                if (hasSubs) toggleTopicExpand(topic.id);
                              }}
                            >
                              {hasSubs ? (
                                <span className="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                                  {topicExpanded ? "▾" : "▸"}
                                </span>
                              ) : (
                                <span className="w-3 shrink-0" aria-hidden />
                              )}
                              <span className="min-w-0 flex-1">
                                <span className="font-medium">{topic.title}</span>
                                {hasSubs && (
                                  <p className="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                                    {topic.subtopics.length} subtopics —{" "}
                                    {topicExpanded ? "collapse" : "expand"}
                                  </p>
                                )}
                              </span>
                            </button>
                          </td>
                          <td className="px-2 py-2.5 font-mono text-xs">
                            {formatWeightDisplay(
                              topicTotalWeight(topic, topic.subtopics),
                            )}
                          </td>
                          {tab === "active" ? (
                            <>
                              <td className="whitespace-nowrap px-2 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-12 shrink-0 overflow-hidden rounded bg-[var(--bg-muted)]">
                                    <div
                                      className="h-full rounded"
                                      style={{ width: `${pct}%`, background: subject.color }}
                                    />
                                  </div>
                                  <span className="font-mono text-[10px] text-[var(--text-muted)]">
                                    {pct}%
                                  </span>
                                </div>
                              </td>
                              <td className="px-2 py-2.5">
                                {inPhase ? (
                                  <span className="rounded bg-[var(--bg-muted)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--accent)]">
                                    in phase
                                  </span>
                                ) : (
                                  <span className="text-[var(--text-muted)]">—</span>
                                )}
                              </td>
                            </>
                          ) : (
                            <td className="whitespace-nowrap px-2 py-2.5 font-mono text-[10px] text-[var(--text-muted)]">
                              {formatSyllabusLogDate(topicDoneDate, today)}
                            </td>
                          )}
                          <td
                            className={cn(
                              "px-2 py-2.5",
                              tab === "completed" ? "pr-7" : "pr-4",
                            )}
                          >
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                className="btn inline-flex h-[22px] min-w-[26px] items-center justify-center px-1.5 py-0.5 text-[9px] leading-none"
                                aria-label={`Edit topic ${topic.title}`}
                                title="Edit topic"
                                disabled={pending}
                                onClick={() => openTopicEdit(topic, subject.id)}
                              >
                                <Pencil className="h-3 w-3" aria-hidden />
                              </button>
                              {!readOnly && (
                                <button
                                  type="button"
                                  className="btn inline-flex h-[22px] min-w-[26px] items-center justify-center px-1.5 py-0.5 text-[9px] leading-none"
                                  aria-label={`Edit completion log for ${topic.title}`}
                                  title="Edit completion log"
                                  disabled={pending}
                                  onClick={() => setEditLogTopic(topic)}
                                >
                                  <History className="h-3 w-3" aria-hidden />
                                </button>
                              )}
                              {!readOnly && tab === "active" && (
                                <>
                                  {currentPhaseId && !inPhase && !complete && (
                                    <button
                                      type="button"
                                      className="btn inline-flex h-[22px] min-w-[26px] items-center justify-center px-1.5 py-0.5 text-[9px] leading-none"
                                      disabled={pending}
                                      onClick={async () => {
                                        await addTopicsToPhase(currentPhaseId, [topic.id]);
                                        refresh();
                                      }}
                                    >
                                      +φ
                                    </button>
                                  )}
                                  {currentPhaseId && inPhase && (
                                    <button
                                      type="button"
                                      className="btn inline-flex h-[22px] min-w-[26px] items-center justify-center px-1.5 py-0.5 text-[9px] leading-none disabled:opacity-40 disabled:hover:border-[var(--border)] disabled:hover:text-[var(--danger)]"
                                      disabled={pending || dephaseBlocked}
                                      title={dephaseBlockTitle ?? "Remove from phase"}
                                      onClick={async () => {
                                        try {
                                          await removeTopicFromPhase(
                                            currentPhaseId,
                                            topic.id,
                                          );
                                          refresh();
                                        } catch {
                                          refresh();
                                        }
                                      }}
                                    >
                                      −φ
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        {topicExpanded &&
                          topic.subtopics.map((sub) => {
                            const subDate = syllabusSubtopicLogDate(
                              sub.id,
                              completionDates,
                              volatileToday.subtopicIds,
                              today,
                            );
                            const subDone =
                              Boolean(sub.completedAt) ||
                              volatileToday.subtopicIds.has(sub.id);
                            return (
                              <tr
                                key={sub.id}
                                className="border-b border-[var(--border)] bg-[var(--bg-muted)]/20"
                              >
                                <td />
                                <td className="px-4 py-2 pl-10 text-xs text-[var(--text-muted)]">
                                  ↳ {sub.title}
                                </td>
                                <td className="px-2 py-2 font-mono text-[10px]">
                                  {formatWeightDisplay(sub.weight)}
                                </td>
                                {tab === "active" ? (
                                  <>
                                    <td className="whitespace-nowrap px-2 py-2 font-mono text-[10px]">
                                      {subDone ? (
                                        <span className="text-[var(--accent-green)]">
                                          Done
                                          {subDate
                                            ? ` · ${formatSyllabusLogDate(subDate, today)}`
                                            : ""}
                                        </span>
                                      ) : (
                                        <span className="text-[var(--text-muted)]">To cover</span>
                                      )}
                                    </td>
                                    <td />
                                  </>
                                ) : (
                                  <td className="whitespace-nowrap px-2 py-2 font-mono text-[10px] text-[var(--text-muted)]">
                                    {formatSyllabusLogDate(subDate, today)}
                                  </td>
                                )}
                                <td />
                              </tr>
                            );
                          })}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card border-dashed p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-medium">Parking lot</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Ideas not in the syllabus yet — no stats until promoted.
            </p>
          </div>
          {!readOnly && subjectCount > 0 && (
            <button
              type="button"
              className="btn text-xs"
              onClick={() => setModal({ type: "parking" })}
            >
              + Idea
            </button>
          )}
        </div>
        <div className="mt-3">
          {backlogSubjects.every((s) => !(s.backlogItems?.length)) ? (
            <p className="text-sm text-[var(--text-muted)]">No ideas saved.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {backlogSubjects.flatMap((s) =>
                  (s.backlogItems ?? []).map((b) => (
                    <tr key={b.id} className="border-t border-[var(--border)]">
                      <td className="py-2 font-mono text-[10px]" style={{ color: s.color }}>
                        {s.name}
                      </td>
                      <td className="py-2">{b.title}</td>
                      <td className="py-2 text-right">
                        {!readOnly && (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary mr-1 text-[10px]"
                              onClick={() =>
                                setModal({ type: "promote", backlogId: b.id, title: b.title })
                              }
                            >
                              To syllabus
                            </button>
                            <button
                              type="button"
                              className="btn text-[10px]"
                              onClick={async () => {
                                await deleteBacklogItem(b.id);
                                refresh();
                              }}
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <SubjectModal
        open={modal.type === "subject"}
        objectiveId={objectiveId}
        edit={modal.type === "subject" ? modal.edit : undefined}
        usedColors={subjectColorsInUse}
        onClose={() => setModal({ type: "closed" })}
        onSaved={() => {
          setModal({ type: "closed" });
          refresh();
        }}
      />

      {editLogTopic && (
        <TopicEditLogModal
          open={Boolean(editLogTopic)}
          topic={editLogTopic}
          objectiveId={objectiveId}
          today={today}
          objectiveStart={objectiveStart}
          objectiveEnd={objectiveEnd}
          phase={phase}
          calendarDays={calendarDays}
          completionDates={completionDates}
          volatileSubtopicIds={volatileToday.subtopicIds}
          volatileTopicIds={volatileToday.topicIds}
          onClose={() => setEditLogTopic(null)}
          onSaved={() => refresh()}
        />
      )}

      <TopicEditModal
        open={modal.type === "topic"}
        subjects={activeView}
        subjectId={modal.type === "topic" ? modal.subjectId : undefined}
        edit={editingTopic}
        readOnly={readOnly}
        volatileToday={volatileToday}
        onClose={() => setModal({ type: "closed" })}
        onRefresh={refresh}
        onRequestDelete={(topic) => {
          setModal({ type: "closed" });
          requestTopicDelete(topic);
        }}
        onSaved={() => {
          setModal({ type: "closed" });
          refresh();
        }}
      />

      <ParkingModal
        open={modal.type === "parking"}
        subjects={activeView}
        subjectId={modal.type === "parking" ? modal.subjectId : undefined}
        onClose={() => setModal({ type: "closed" })}
        onSaved={() => {
          setModal({ type: "closed" });
          refresh();
        }}
      />

      <DangerousTopicDeleteModal
        open={Boolean(confirmDelete)}
        topicTitle={confirmDelete?.title ?? ""}
        impact={
          confirmDelete
            ? topicDeleteImpact(confirmDelete, confirmDelete.subtopics, {
                inPhase: phaseTopicIds.includes(confirmDelete.id),
              })
            : null
        }
        pending={pending}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await deleteTopic(confirmDelete.id);
          setConfirmDelete(null);
          refresh();
        }}
      />

      <PromoteModal
        open={modal.type === "promote"}
        title={modal.type === "promote" ? modal.title : ""}
        onClose={() => setModal({ type: "closed" })}
        onPromote={async (weight) => {
          if (modal.type !== "promote") return;
          await promoteBacklogItem(modal.backlogId, weight);
          setModal({ type: "closed" });
          refresh();
        }}
      />
    </div>
  );
}

function formatSyllabusLogDate(date: string | null, today: string): string {
  if (!date) return "—";
  return date === today ? "Today" : date;
}

function syllabusSubtopicLogDate(
  subtopicId: string,
  completionDates: CompletionDates,
  volatileSubtopicIds: Set<string>,
  today: string,
): string | null {
  return (
    completionDates.bySubtopicId[subtopicId] ??
    (volatileSubtopicIds.has(subtopicId) ? today : null)
  );
}

function syllabusTopicLogDate(
  topic: Topic,
  completionDates: CompletionDates,
  volatileToday: ReturnType<typeof volatileKeysFromCompletionDates>,
  today: string,
): string | null {
  if (topic.subtopics.length === 0) {
    return (
      completionDates.byTopicId[topic.id] ??
      (volatileToday.topicIds.has(topic.id) ? today : null)
    );
  }
  const dates = topic.subtopics
    .map((s) =>
      syllabusSubtopicLogDate(
        s.id,
        completionDates,
        volatileToday.subtopicIds,
        today,
      ),
    )
    .filter((d): d is string => Boolean(d));
  if (dates.length === 0) return null;
  return dates.sort().at(-1) ?? null;
}

function ViewTab({
  id,
  selected,
  label,
  count,
  onSelect,
}: {
  id: string;
  selected: boolean;
  label: string;
  count: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`syllabus-tab-${id}`}
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 font-mono text-xs transition-all sm:min-w-[9rem]",
        selected
          ? "bg-[var(--accent)] font-semibold text-[#0d1117]"
          : "text-[var(--text-muted)] hover:bg-[var(--bg-muted)]",
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px]",
          selected ? "bg-[#0d1117]/20" : "bg-[var(--bg-muted)]",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function SubjectModal({
  open,
  objectiveId,
  edit,
  usedColors,
  onClose,
  onSaved,
}: {
  open: boolean;
  objectiveId: string;
  edit?: { id: string; name: string; color: string };
  usedColors: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(edit);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_SUBJECT_COLOR);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (edit) {
      setName(edit.name);
      setColor(edit.color);
    } else {
      setName("");
      setColor(pickSubjectColor(usedColors));
    }
    setError(null);
  }, [open, edit, usedColors]);

  const otherSubjectColors = edit
    ? usedColors.filter(
        (c) => normalizeHexColor(c) !== normalizeHexColor(edit.color),
      )
    : usedColors;

  return (
    <Modal
      open={open}
      title={isEdit ? "Edit subject" : "Add subject"}
      description="Each subject has one color used on the syllabus, calendar, and dashboard."
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            setError(null);
            if (isEdit && edit) {
              await updateSubject(edit.id, { name: name.trim(), color });
            } else {
              await createSubject(objectiveId, { name: name.trim(), color });
              setName("");
            }
            onSaved();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed");
          }
        }}
      >
        <input
          className="input"
          placeholder="Subject name"
          value={name}
          required
          onChange={(e) => setName(e.target.value)}
        />
        <SubjectColorField
          value={color}
          onChange={setColor}
          otherSubjectColors={otherSubjectColors}
        />
        {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">
            {isEdit ? "Save" : "Create subject"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ParkingModal({
  open,
  subjects,
  subjectId,
  onClose,
  onSaved,
}: {
  open: boolean;
  subjects: SubjectBucket[];
  subjectId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [subject, setSubject] = useState(subjectId ?? subjects[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSubject(subjectId ?? subjects[0]?.id ?? "");
    setTitle("");
    setNotes("");
    setError(null);
  }, [open, subjectId, subjects]);

  return (
    <Modal
      open={open}
      title="Park an idea"
      description="Save a title for later — promote it to the syllabus when ready."
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            setError(null);
            const trimmed = title.trim();
            if (!trimmed) {
              setError("Enter a title.");
              return;
            }
            await createBacklogItem(subject, {
              title: trimmed,
              notes: notes.trim() || undefined,
            });
            onSaved();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed");
          }
        }}
      >
        <label className="block text-xs text-[var(--text-muted)]">
          Subject
          <select
            className="input mt-1"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <input
          className="input"
          placeholder="Idea title"
          value={title}
          required
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="input min-h-[64px] text-xs"
          placeholder="Optional notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save idea
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PromoteModal({
  open,
  title,
  onClose,
  onPromote,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onPromote: (weight: number) => Promise<void>;
}) {
  const [weight, setWeight] = useState("");
  const [promoteError, setPromoteError] = useState<string | null>(null);
  return (
    <Modal open={open} title="Add to syllabus" description={title} onClose={onClose}>
      <label className="text-xs text-[var(--text-muted)]">
        Weight for this topic
        <input
          className="input mt-1 w-24 font-mono text-xs"
          placeholder="Weight"
          inputMode="decimal"
          value={weight}
          onChange={(e) => {
            setWeight(sanitizeWeightInput(e.target.value));
            setPromoteError(null);
          }}
        />
      </label>
      {promoteError && (
        <p className="mt-2 text-xs text-[var(--danger)]">{promoteError}</p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            const w = parsePositiveWeight(weight);
            if (w == null) {
              setPromoteError("Enter a valid numeric weight greater than zero.");
              return;
            }
            setPromoteError(null);
            void onPromote(w);
          }}
        >
          Promote
        </button>
      </div>
    </Modal>
  );
}
