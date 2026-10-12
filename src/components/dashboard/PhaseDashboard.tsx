"use client";

import { useState, useTransition } from "react";
import { PhaseProgressDonut } from "@/components/charts/PhaseProgressDonut";
import { PhaseAttentionTopics } from "@/components/dashboard/PhaseAttentionTopics";
import { PhaseSubjectDistribution } from "@/components/dashboard/PhaseSubjectDistribution";
import {
  PhaseSubjectPace,
  PhaseSubjectPaceView,
} from "@/components/dashboard/PhaseSubjectPace";
import {
  PhaseWeightDayChart,
  type ChartMode,
} from "@/components/dashboard/PhaseWeightDayChart";
import {
  getObjectiveDayDetail,
  getPhaseDayDetail,
  type PhaseDashboardPayload,
  type PhaseDayDetailPayload,
} from "@/lib/actions/phase-dashboard";
import { cn } from "@/lib/cn";
import { formatWeightDisplay } from "@/lib/weight";

export function PhaseDashboard({
  objectiveId,
  data,
  chartWindow = 12,
}: {
  objectiveId: string;
  data: PhaseDashboardPayload;
  chartWindow?: number;
}) {
  const isCycle = data.scope === "cycle";
  const scopeLabel = isCycle ? "Cycle" : "Phase";
  const progressLabel = isCycle ? "Cycle progress" : "Phase progress";
  const daysLeftLabel = isCycle ? "cycle" : "phase";
  const [chartMode, setChartMode] = useState<ChartMode>("weight");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<PhaseDayDetailPayload | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(
    null,
  );
  const [selectedPaceSubjectId, setSelectedPaceSubjectId] = useState<
    string | null
  >(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function loadDayDetail(date: string) {
    startTransition(async () => {
      const detail = isCycle
        ? await getObjectiveDayDetail(objectiveId, date)
        : await getPhaseDayDetail(objectiveId, data.phase.id, date);
      setDayDetail(detail);
    });
  }

  function openDay(date: string) {
    setSelectedDay(date);
    setSelectedSubjectId(null);
    setSelectedPaceSubjectId(null);
    setSelectedTopicId(null);
    if (chartMode === "weight") {
      loadDayDetail(date);
    } else {
      setDayDetail(null);
    }
  }

  function handleChartModeChange(mode: ChartMode) {
    setChartMode(mode);
    if (mode === "speed") {
      setDayDetail(null);
    } else if (selectedDay !== null) {
      loadDayDetail(selectedDay);
    }
  }

  function openSubject(subjectId: string) {
    setSelectedSubjectId(subjectId);
    setSelectedPaceSubjectId(null);
    setSelectedDay(null);
    setSelectedTopicId(null);
    setDayDetail(null);
  }

  function openPaceSubject(subjectId: string) {
    setSelectedPaceSubjectId(subjectId);
    setSelectedSubjectId(null);
    setSelectedDay(null);
    setSelectedTopicId(null);
    setDayDetail(null);
  }

  function openAttentionTopic(topicId: string) {
    setSelectedTopicId(topicId);
    setSelectedDay(null);
    setSelectedSubjectId(null);
    setSelectedPaceSubjectId(null);
    setDayDetail(null);
  }

  const selectedSubject =
    selectedSubjectId !== null
      ? data.subjects.find((s) => s.subjectId === selectedSubjectId)
      : undefined;

  const subjectTopics = selectedSubjectId
    ? (data.topicsBySubject[selectedSubjectId] ?? [])
    : [];

  const viewingToday =
    selectedDay !== null && selectedDay === data.today;

  const selectedPaceDay =
    selectedDay !== null
      ? data.days.find((d) => d.date === selectedDay)
      : undefined;

  const paceRequiredForDay =
    selectedDay !== null &&
    data.tomorrow !== null &&
    selectedDay === data.tomorrow &&
    data.requiredFromTomorrow != null
      ? data.requiredFromTomorrow
      : (selectedPaceDay?.requiredAsOfDay ?? null);

  const selectedAttentionTopic =
    selectedTopicId !== null
      ? data.attentionTopics.find((t) => t.topicId === selectedTopicId)
      : undefined;

  const selectedPaceRow =
    selectedPaceSubjectId !== null
      ? data.subjectPace.rows.find(
          (row) => row.subjectId === selectedPaceSubjectId,
        )
      : undefined;

  const paceRequiredLabel =
    selectedDay !== null &&
    data.tomorrow !== null &&
    selectedDay === data.tomorrow &&
    data.requiredFromTomorrow != null
      ? "Required from here on"
      : "Required pace";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="font-mono text-xs text-[var(--text-muted)]">
          {scopeLabel} · {data.phase.name} · {data.phase.startDate} →{" "}
          {data.phase.endDate}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="card flex flex-wrap items-center gap-6 p-6 sm:gap-8">
            <PhaseProgressDonut
              donePercent={data.summary.percent}
              projectedPercent={data.summary.projectedPercent}
              label={progressLabel}
              size={120}
            />
            <div className="font-mono text-sm space-y-1">
              <p>
                <span className="text-[var(--text-muted)]">logged</span>{" "}
                {formatWeightDisplay(data.summary.doneWeight)}/
                {formatWeightDisplay(data.summary.totalWeight)}{" "}
                <span className="text-[var(--text-muted)]">wt</span>
              </p>
              <p>
                <span className="text-[var(--text-muted)]">left</span>{" "}
                {formatWeightDisplay(data.summary.remainingWeight)}{" "}
                <span className="text-[var(--text-muted)]">wt</span>
              </p>
              <p>
                <span className="text-[var(--text-muted)]">{daysLeftLabel}</span>{" "}
                {data.summary.daysLeft}
                <span className="text-[var(--text-muted)]">d left</span>
              </p>
            </div>
            <div className="font-mono text-xs space-y-1 sm:border-l sm:border-[var(--border)] sm:pl-6">
              <p>
                <span className="text-[var(--text-muted)]">required pace</span>{" "}
                {data.pace.requiredPerDay}{" "}
                <span className="text-[var(--text-muted)]">wt/d</span>
              </p>
              <p>
                <span className="text-[var(--text-muted)]">current pace (5d avg)</span>{" "}
                <span
                  className={
                    data.pace.onTrack
                      ? "text-[var(--accent-green)]"
                      : "text-[var(--accent-amber)]"
                  }
                >
                  {data.pace.current5DayAvg}
                </span>{" "}
                <span className="text-[var(--text-muted)]">wt/d</span>
              </p>
              <p>
                <span className="text-[var(--text-muted)]">spillover</span>{" "}
                {data.pace.spillover > 0 ? (
                  <span className="text-[var(--accent-amber)]">
                    {data.pace.spillover} wt
                  </span>
                ) : (
                  <span className="text-[var(--accent-green)]">none</span>
                )}
              </p>
              {data.pace.spillover > 0 &&
              data.pace.extraDaysForSpillover != null ? (
                <p>
                  <span className="text-[var(--text-muted)]">extra days</span>{" "}
                  <span className="text-[var(--accent-amber)]">
                    ~{data.pace.extraDaysForSpillover}d
                  </span>
                </p>
              ) : null}
            </div>
          </div>

          <section className="card p-4">
            <PhaseWeightDayChart
              days={data.days}
              today={data.today}
              tomorrow={data.tomorrow}
              requiredFromTomorrow={data.requiredFromTomorrow}
              mode={chartMode}
              onModeChange={handleChartModeChange}
              selectedDay={selectedDay}
              onSelectDay={openDay}
              windowSize={chartWindow}
            />
          </section>

          {data.subjects.length >= 2 ? (
            <section className="card p-4">
              <h2 className="mb-4 font-mono text-sm text-[var(--text-muted)]">
                Subject distribution
              </h2>
              <PhaseSubjectDistribution
                subjects={data.subjects}
                selectedSubjectId={selectedSubjectId}
                onSelect={openSubject}
              />
            </section>
          ) : null}

          {data.subjectPace.rows.length > 0 ? (
            <section className="card p-4">
              <h2 className="mb-3 font-mono text-sm text-[var(--text-muted)]">
                Subject pace
              </h2>
              <PhaseSubjectPace
                rows={data.subjectPace.rows}
                selectedSubjectId={selectedPaceSubjectId}
                onSelect={openPaceSubject}
              />
            </section>
          ) : null}
        </div>

        <div className="flex min-h-0 min-w-0 w-full flex-col gap-6">
          {data.attentionTopics.length > 0 ? (
            <section className="card w-full p-4">
              <h2 className="mb-3 font-mono text-sm text-[var(--text-muted)]">
                Needs attention
              </h2>
              <PhaseAttentionTopics
                topics={data.attentionTopics}
                selectedTopicId={selectedTopicId}
                onSelect={openAttentionTopic}
              />
            </section>
          ) : null}
          <aside
            className={cn(
              "card flex min-h-[280px] w-full min-w-0 flex-col p-5",
              "xl:sticky xl:top-[var(--sticky-panel-top)] xl:z-30",
              "xl:max-h-[var(--sticky-panel-max-height)]",
            )}
          >
            <h2 className="mb-4 shrink-0 border-b border-[var(--border)] pb-3 font-mono text-xs uppercase tracking-wide text-[var(--text-muted)]">
              View
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto">
          {pending && (
            <p className="text-sm text-[var(--text-muted)]">Loading…</p>
          )}
          {!pending &&
            chartMode === "speed" &&
            selectedDay &&
            selectedPaceDay && (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-mono text-lg text-[var(--text)]">
                    {selectedPaceDay.date}
                  </p>
                  <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                    {selectedPaceDay.completed} wt logged
                  </p>
                </div>
                {selectedPaceDay.date > data.today &&
                paceRequiredForDay == null ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    No pace for this day.
                  </p>
                ) : (
                  <div className="space-y-1.5 font-mono text-xs">
                    {selectedPaceDay.date <= data.today ? (
                      <p className="flex justify-between gap-3">
                        <span className="text-[var(--text-muted)]">5-day avg</span>
                        <span>
                          {selectedPaceDay.rolling5DayAvg != null
                            ? `${selectedPaceDay.rolling5DayAvg} wt/d`
                            : "—"}
                        </span>
                      </p>
                    ) : null}
                    {paceRequiredForDay != null ? (
                      <p className="flex justify-between gap-3">
                        <span className="text-[var(--text-muted)]">
                          {paceRequiredLabel}
                        </span>
                        <span>{paceRequiredForDay} wt/d</span>
                      </p>
                    ) : null}
                    {selectedPaceDay.date <= data.today &&
                    selectedPaceDay.rolling5DayAvg != null &&
                    paceRequiredForDay != null ? (
                      <p
                        className={
                          selectedPaceDay.rolling5DayAvg >=
                          paceRequiredForDay * 0.9
                            ? "text-[var(--accent-green)]"
                            : "text-[var(--accent-amber)]"
                        }
                      >
                        {selectedPaceDay.rolling5DayAvg >=
                        paceRequiredForDay * 0.9
                          ? "At pace"
                          : `${(paceRequiredForDay - selectedPaceDay.rolling5DayAvg).toFixed(1)} wt/d short`}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          {!pending && chartMode === "weight" && selectedDay && dayDetail && (
            <div className="flex min-h-0 flex-1 flex-col gap-4 text-sm">
              <div>
                <p className="font-mono text-lg text-[var(--text)]">
                  {dayDetail.date}
                </p>
                <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                  {dayDetail.completed
                    .reduce((s, r) => s + r.weight, 0)
                    .toFixed(1)}{" "}
                  wt {viewingToday ? "so far" : "logged"}
                  {dayDetail.planned.length > 0
                    ? ` · ${dayDetail.planned.reduce((s, r) => s + r.weight, 0).toFixed(1)} wt planned`
                    : ""}
                </p>
              </div>
              {dayDetail.completed.length > 0 && (
                <div>
                  <h3 className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-[#58a6ff]">
                    {viewingToday ? "Done" : "Logged"}
                  </h3>
                  <ul className="max-h-[220px] space-y-1 overflow-y-auto">
                    {dayDetail.completed.map((row, i) => (
                      <li
                        key={`c-${i}`}
                        className="flex items-baseline justify-between gap-3 py-0.5"
                      >
                        <span className="min-w-0 leading-snug">
                          <span
                            className="mr-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full align-middle"
                            style={{ background: row.subjectColor }}
                          />
                          {row.subtopicTitle ? (
                            <>
                              <span className="text-[var(--text-muted)]">
                                {row.title}
                              </span>
                              <span className="text-[var(--text-muted)]"> · </span>
                              {row.subtopicTitle}
                            </>
                          ) : (
                            row.title
                          )}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
                          {row.weight} wt
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {dayDetail.planned.length > 0 && (
                <div>
                  <h3 className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                    Planned
                  </h3>
                  <ul className="max-h-[220px] space-y-1 overflow-y-auto">
                    {dayDetail.planned.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-baseline justify-between gap-3 py-0.5"
                      >
                        <span className="min-w-0 leading-snug">
                          <span
                            className="mr-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full align-middle"
                            style={{ background: row.subjectColor }}
                          />
                          {row.subtopicTitle ? (
                            <>
                              <span className="text-[var(--text-muted)]">
                                {row.title}
                              </span>
                              <span className="text-[var(--text-muted)]"> · </span>
                              {row.subtopicTitle}
                            </>
                          ) : (
                            row.title
                          )}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
                          {row.weight} wt
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {dayDetail.completed.length === 0 &&
                dayDetail.planned.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)]">
                    Nothing logged or planned.
                  </p>
                )}
            </div>
          )}
          {!pending && selectedSubjectId && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 text-sm">
              <p className="text-lg font-medium">
                <span
                  className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ background: selectedSubject?.color }}
                />
                {selectedSubject?.name}
              </p>
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                {subjectTopics.map((t) => (
                  <li key={t.topicId}>
                    <p className="leading-snug">{t.title}</p>
                    <p className="font-mono text-[10px] text-[var(--text-muted)]">
                      {t.completedWeight}/{t.totalWeight} wt
                      {t.subtopicTotal > 0
                        ? ` · ${t.subtopicDone}/${t.subtopicTotal} subtopics`
                        : ""}
                      {t.lastLogDate ? ` · last ${t.lastLogDate}` : " · no log"}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!pending && selectedPaceRow && (
            <PhaseSubjectPaceView
              row={selectedPaceRow}
              ready={data.subjectPace.ready}
            />
          )}
          {!pending && selectedAttentionTopic && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-lg font-medium leading-snug">
                  <span
                    className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                    style={{ background: selectedAttentionTopic.subjectColor }}
                  />
                  {selectedAttentionTopic.title}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {selectedAttentionTopic.subjectName}
                </p>
              </div>
              <p className="font-mono text-xs text-[var(--text-muted)]">
                {selectedAttentionTopic.completedWeight}/
                {selectedAttentionTopic.totalWeight} wt ·{" "}
                {selectedAttentionTopic.reason === "missed"
                  ? "Missed plan"
                  : selectedAttentionTopic.reason === "never"
                    ? "Never started"
                    : "Stalled"}
                {selectedAttentionTopic.reason === "missed" &&
                selectedAttentionTopic.missedPlanDays > 1
                  ? ` · ${selectedAttentionTopic.missedPlanDays} days`
                  : ""}
                {" · "}
                {selectedAttentionTopic.lastLogDate
                  ? `last ${selectedAttentionTopic.lastLogDate}`
                  : "no log"}
              </p>
              {selectedAttentionTopic.reason === "missed" &&
              selectedAttentionTopic.missedDates.length > 0 ? (
                <ul className="space-y-1 font-mono text-xs">
                  {selectedAttentionTopic.missedDates.map((date) => (
                    <li
                      key={date}
                      className="flex items-center justify-between gap-3"
                    >
                      <span>{date}</span>
                      <span className="text-[var(--text-muted)]">missed</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div>
                <h3 className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  Scheduled
                </h3>
                {selectedAttentionTopic.scheduledDates.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    Not on a day plan.
                  </p>
                ) : (
                  <ul className="max-h-[180px] space-y-1 overflow-y-auto font-mono text-xs">
                    {selectedAttentionTopic.scheduledDates.map((date) => (
                      <li
                        key={date}
                        className="flex items-center justify-between gap-3"
                      >
                        <span>{date}</span>
                        <span className="text-[var(--text-muted)]">
                          {date < data.today
                            ? "past"
                            : date === data.today
                              ? "today"
                              : "upcoming"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          {!pending &&
            !selectedDay &&
            !selectedSubjectId &&
            !selectedPaceSubjectId &&
            !selectedAttentionTopic && (
            <p className="text-sm text-[var(--text-muted)]">
              Select a day, subject, or topic.
            </p>
          )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
