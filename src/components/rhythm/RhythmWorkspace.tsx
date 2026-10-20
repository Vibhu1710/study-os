"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  ContributionCalendar,
  type DayStat,
} from "@/components/calendar/ContributionCalendar";
import { EditLogDayPreview } from "@/components/syllabus/EditLogDayPreview";
import { RhythmBarChart, sessionsToChartDays } from "@/components/rhythm/RhythmBarChart";
import { RhythmSessionMasterModal } from "@/components/rhythm/RhythmSessionMasterModal";
import { RhythmSessionAveragesPanel } from "@/components/rhythm/RhythmSessionAveragesPanel";
import { cn } from "@/lib/cn";
import {
  fetchRhythmDayDefaults,
  fetchRhythmDayNote,
  removeRhythmSession,
  saveRhythmDayState,
} from "@/lib/actions/rhythm";
import { fetchDayDetail } from "@/lib/actions/day";
import { DayNoteField } from "@/components/day/DayNoteField";
import { RhythmLogCardBody } from "@/components/rhythm/RhythmLogCardBody";
import type { RhythmSandglassConfig } from "@/lib/rhythm/effective-minutes";
import type { RhythmDayState } from "@/lib/rhythm/entries";
import { foldEntriesToLegacy } from "@/lib/rhythm/entries";
import { nowHhmm } from "@/components/rhythm/RhythmMasterTimePanel";
import { RHYTHM_TODAY_UPDATED_EVENT } from "@/lib/rhythm/shortcut-events";

type Aggregate = {
  avgStartMinutes: number | null;
  avgEndMinutes: number | null;
  avgEffectiveMinutes: number | null;
  avgBreakMinutes: number | null;
  count: number;
};

export type RhythmSessionDto = RhythmDayState & { date: string };

export function RhythmWorkspace({
  objectiveId,
  objectiveStart,
  objectiveEnd,
  readOnly,
  today,
  selectedDate: initialDate,
  coverageDays,
  effortDays,
  sessions,
  sandglass,
  aggregates,
  phaseStart,
  phaseEnd,
  phaseName,
}: {
  objectiveId: string;
  objectiveStart: string;
  objectiveEnd: string;
  readOnly: boolean;
  today: string;
  selectedDate: string;
  coverageDays: Record<string, DayStat>;
  effortDays: Record<string, DayStat>;
  sessions: RhythmSessionDto[];
  sandglass: RhythmSandglassConfig;
  aggregates: { allTime: Aggregate; last5: Aggregate };
  phaseStart: string | null;
  phaseEnd: string | null;
  phaseName: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [calendarMode, setCalendarMode] = useState<"effort" | "coverage">("effort");
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [dayDetail, setDayDetail] = useState<Awaited<
    ReturnType<typeof fetchDayDetail>
  > | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [rhythmDayNote, setRhythmDayNote] = useState<string | null>(null);

  const sessionByDate = useMemo(() => {
    const m = new Map<string, RhythmSessionDto>();
    for (const s of sessions) m.set(s.date, s);
    return m;
  }, [sessions]);

  const currentSession = sessionByDate.get(selectedDate) ?? null;
  const selectedStat = coverageDays[selectedDate] ?? effortDays[selectedDate];

  const calendarDays = calendarMode === "effort" ? effortDays : coverageDays;

  const loadDayDetail = useCallback(
    (date: string) => {
      setDayLoading(true);
      fetchDayDetail(objectiveId, date)
        .then(setDayDetail)
        .finally(() => setDayLoading(false));
    },
    [objectiveId],
  );

  const onSelectDate = useCallback(
    (date: string) => {
      if (date > today) return;
      setSelectedDate(date);
      const next = `/rhythm?date=${encodeURIComponent(date)}`;
      window.history.replaceState(window.history.state, "", next);
    },
    [today],
  );

  useEffect(() => {
    setSelectedDate(initialDate);
  }, [initialDate]);

  useEffect(() => {
    loadDayDetail(selectedDate);
  }, [selectedDate, loadDayDetail]);

  useEffect(() => {
    let cancelled = false;
    fetchRhythmDayNote(objectiveId, selectedDate).then((note) => {
      if (!cancelled) setRhythmDayNote(note);
    });
    return () => {
      cancelled = true;
    };
  }, [objectiveId, selectedDate]);

  useEffect(() => {
    function onTodayUpdated() {
      router.refresh();
    }
    window.addEventListener(RHYTHM_TODAY_UPDATED_EVENT, onTodayUpdated);
    return () =>
      window.removeEventListener(RHYTHM_TODAY_UPDATED_EVENT, onTodayUpdated);
  }, [router]);

  const chartDays = useMemo(() => {
    const legacySessions = sessions.map((s) => {
      const folded = foldEntriesToLegacy(s.startsWithOddCycle, s.entries);
      return {
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        startTimeConfirmed: s.startTimeConfirmed,
        endTimeConfirmed: s.endTimeConfirmed,
        startsWithOddCycle: s.startsWithOddCycle,
        fullCycleCount: folded.fullCycleCount,
        startPartialTenths: folded.startPartialTenths,
        endPartialTenths: folded.endPartialTenths,
      };
    });
    return sessionsToChartDays(legacySessions, sandglass);
  }, [sessions, sandglass]);

  const [formSeed, setFormSeed] = useState<RhythmDayState | null>(null);
  const [carryRemainingTenths, setCarryRemainingTenths] = useState(0);
  const [dayModalOpen, setDayModalOpen] = useState(false);

  useEffect(() => {
    if (currentSession) {
      setFormSeed(currentSession);
      return;
    }
    let cancelled = false;
    fetchRhythmDayDefaults(objectiveId, selectedDate).then((defaults) => {
      if (cancelled) return;
      setCarryRemainingTenths(defaults.carryRemainingTenths);
      setFormSeed({
        startTime: nowHhmm(),
        endTime: nowHhmm(),
        startTimeConfirmed: false,
        endTimeConfirmed: false,
        startsWithOddCycle: defaults.startsWithOddCycle,
        continuedFromPreviousDay: defaults.continuedFromPreviousDay,
        entries: [],
      });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedDate, currentSession, objectiveId]);

  const save = (state: RhythmDayState) => {
    startTransition(async () => {
      await saveRhythmDayState(objectiveId, selectedDate, state);
      router.refresh();
    });
  };

  const clear = () => {
    startTransition(async () => {
      await removeRhythmSession(objectiveId, selectedDate);
      router.refresh();
    });
  };

  const [avgWindow, setAvgWindow] = useState<"last5" | "cycle">("last5");
  const avg = avgWindow === "last5" ? aggregates.last5 : aggregates.allTime;

  const canEditDay = !readOnly && selectedDate <= today;
  const canOpenDayModal =
    selectedDate <= today && (canEditDay || currentSession != null);
  const dayModalReadOnly = readOnly || !canEditDay;

  const dayForModal = currentSession ?? formSeed;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Study Momentum</h1>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-3 self-start">
          <ContributionCalendar
            selectedDate={selectedDate}
            days={calendarDays}
            objectiveStart={objectiveStart}
            objectiveEnd={objectiveEnd}
            phaseStart={calendarMode === "coverage" ? phaseStart : null}
            phaseEnd={calendarMode === "coverage" ? phaseEnd : null}
            phaseName={calendarMode === "coverage" ? phaseName : null}
            today={today}
            onSelect={onSelectDate}
            disableFutureDays
            showPhaseOutline={calendarMode === "coverage"}
            showPhaseCaption={false}
            effortHeat={calendarMode === "effort"}
            coverageDays={coverageDays}
            heatViewToggle={{
              mode: calendarMode,
              onChange: setCalendarMode,
            }}
          />
        </div>

        <aside
          className={cn(
            "space-y-4 min-w-0",
            "xl:sticky xl:top-[var(--sticky-panel-top)] xl:z-30",
            "xl:max-h-[var(--sticky-panel-max-height)] xl:overflow-y-auto",
          )}
        >
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-3">
              <div className="min-w-0">
                <h3 className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  Momentum log
                </h3>
                <p className="mt-0.5 font-mono text-xs text-[var(--accent)]">{selectedDate}</p>
              </div>
              {canOpenDayModal && dayForModal ? (
                <button
                  type="button"
                  className="btn btn-primary shrink-0 text-xs"
                  disabled={pending}
                  onClick={() => setDayModalOpen(true)}
                >
                  {dayModalReadOnly ? "View day" : "Configure day"}
                </button>
              ) : null}
            </div>
            <DayNoteField
              key={calendarMode}
              objectiveId={objectiveId}
              date={selectedDate}
              kind={calendarMode === "coverage" ? "coverage" : "effort"}
              dayNote={
                calendarMode === "coverage" ? dayDetail?.dayNote : rhythmDayNote
              }
              canEdit={canEditDay}
              onPersisted={async () => {
                if (calendarMode === "effort") {
                  setRhythmDayNote(
                    await fetchRhythmDayNote(objectiveId, selectedDate),
                  );
                } else {
                  loadDayDetail(selectedDate);
                }
              }}
            />
            <RhythmLogCardBody
              session={currentSession}
              stat={selectedStat}
              sandglass={sandglass}
              selectedDate={selectedDate}
              today={today}
            />
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <h3 className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              Selected day · syllabus
            </h3>
            <div className="mt-3">
              <EditLogDayPreview
                date={selectedDate}
                detail={dayDetail}
                loading={dayLoading}
              />
            </div>
          </div>
        </aside>
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <RhythmBarChart
          days={chartDays}
          objectiveStart={objectiveStart}
          objectiveEnd={objectiveEnd}
          today={today}
          selectedDay={selectedDate}
          onSelectDay={onSelectDate}
        />
        <RhythmSessionAveragesPanel
          avg={avg}
          avgWindow={avgWindow}
          onAvgWindowChange={setAvgWindow}
        />
      </div>

      {dayForModal && (
        <RhythmSessionMasterModal
          open={dayModalOpen}
          date={selectedDate}
          today={today}
          readOnly={dayModalReadOnly}
          day={dayForModal}
          sandglass={sandglass}
          pending={pending}
          carryRemainingTenths={carryRemainingTenths}
          saved={currentSession != null}
          onClose={() => setDayModalOpen(false)}
          onSave={save}
          onDelete={clear}
        />
      )}
    </div>
  );
}
