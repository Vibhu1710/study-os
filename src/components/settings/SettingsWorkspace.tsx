"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Modal } from "@/components/ui/Modal";
import { DatePicker, DateRangePickers } from "@/components/ui/DatePicker";
import {
  createObjective,
  deleteArchivedObjective,
  endActiveCycleNow,
  openArchivedCycleForView,
  reactivateLastArchivedObjective,
  returnToActiveCycle,
  updateActiveObjective,
} from "@/lib/actions/objectives";
import { cn } from "@/lib/cn";
import {
  inclusiveDayCount,
  MIN_OBJECTIVE_DAYS,
  type DateString,
} from "@/lib/date-span";
import { addDaysString, maxDateString, minObjectiveEndDate } from "@/lib/dates";

type Objective = {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  status: string;
};

export function SettingsWorkspace({
  objectives,
  liveObjective,
  reactivatableObjective,
  viewId,
  isArchiveView,
  today,
}: {
  objectives: Objective[];
  liveObjective: Objective | null;
  reactivatableObjective: Objective | null;
  viewId: string | null;
  isArchiveView: boolean;
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const archived = objectives.filter((o) => today > o.endDate);

  const [name, setName] = useState(liveObjective?.name ?? "");
  const [start, setStart] = useState<DateString | "">(liveObjective?.startDate ?? "");
  const [end, setEnd] = useState<DateString | "">(liveObjective?.endDate ?? "");
  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState<DateString | "">("");
  const [newEnd, setNewEnd] = useState<DateString | "">("");
  const [editError, setEditError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    "edit" | "create" | "end" | "reactivate" | "delete" | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<Objective | null>(null);
  const [deleteTypedName, setDeleteTypedName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reopenName, setReopenName] = useState(reactivatableObjective?.name ?? "");
  const [reopenEnd, setReopenEnd] = useState<DateString | "">(
    reactivatableObjective?.endDate ?? "",
  );
  const [reopenError, setReopenError] = useState<string | null>(null);

  const liveId = liveObjective?.id ?? null;
  const reactivatableId = reactivatableObjective?.id ?? null;

  useEffect(() => {
    if (!liveObjective) return;
    setName(liveObjective.name);
    setStart(liveObjective.startDate);
    setEnd(liveObjective.endDate);
  }, [liveId, liveObjective?.name, liveObjective?.startDate, liveObjective?.endDate]);

  useEffect(() => {
    if (!reactivatableObjective) return;
    setReopenName(reactivatableObjective.name);
    setReopenEnd(
      reactivatableObjective.endDate < today ? today : reactivatableObjective.endDate,
    );
  }, [
    reactivatableId,
    reactivatableObjective?.name,
    reactivatableObjective?.endDate,
    today,
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Study cycle</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
          Set up a few times per year. Edit the live cycle&apos;s dates below; it archives when today
          is after the end date.
        </p>
      </div>

      {isArchiveView && liveObjective && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-[var(--accent-amber)]/40 p-4">
          <p className="text-sm text-[var(--text-muted)]">
            You&apos;re browsing history while{" "}
            <strong className="text-[var(--text)]">{liveObjective.name}</strong> is still your live
            cycle.
          </p>
          <button
            type="button"
            className="btn btn-primary text-xs"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await returnToActiveCycle();
                router.refresh();
              })
            }
          >
            Back to current cycle
          </button>
        </div>
      )}

      {liveObjective ? (
        <form
          className="card max-w-lg space-y-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setEditError(null);
            if (!start || !end) return;
            setConfirmAction("edit");
          }}
        >
          <div className="flex items-center gap-2">
            <span className="rounded bg-[var(--accent)]/15 px-2 py-0.5 font-mono text-[10px] text-[var(--accent)]">
              LIVE
            </span>
            <h2 className="font-medium">Current cycle</h2>
          </div>
          <label className="block text-xs text-[var(--text-muted)]">
            Name
            <input
              className="input mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <DateRangePickers
            start={start}
            end={end}
            onStartChange={setStart}
            onEndChange={setEnd}
            min={today as DateString}
            minSpanDays={MIN_OBJECTIVE_DAYS}
            startDisabled={Boolean(start && start < today)}
            requireStartFirst={false}
            startLabel="Start date"
            endLabel="End date"
            startLegendExtra={
              start && start < today
                ? ["Start is fixed once the cycle has begun."]
                : [`Cannot be before today (${today}).`]
            }
            endLegendExtra={[
              "Study cycles must span at least 14 days (start and end both count).",
            ]}
          />
          {editError && <p className="text-xs text-[var(--danger)]">{editError}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              className="btn btn-primary disabled:opacity-40"
              disabled={
                !start ||
                !end ||
                inclusiveDayCount(start, end) < MIN_OBJECTIVE_DAYS
              }
            >
              Save dates & name
            </button>
            <button
              type="button"
              className="btn text-xs text-[var(--danger)]"
              disabled={pending}
              onClick={() => setConfirmAction("end")}
            >
              End cycle now
            </button>
          </div>
        </form>
      ) : (
        <>
          {reactivatableObjective && (
            <form
              className="card max-w-lg space-y-4 border-[var(--accent)]/30 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                setReopenError(null);
                if (!reopenEnd) return;
                setConfirmAction("reactivate");
              }}
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-[var(--accent-amber)]/15 px-2 py-0.5 font-mono text-[10px] text-[var(--accent-amber)]">
                  REOPEN
                </span>
                <h2 className="font-medium">Last archived cycle</h2>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                This cycle archived because its end date passed ({reactivatableObjective.endDate}).
                Extend the end date to today or later to make it live again — syllabus and calendar
                pick up where you left off. Older archived cycles cannot be reopened.
              </p>
              <label className="block text-xs text-[var(--text-muted)]">
                Name
                <input
                  className="input mt-1"
                  value={reopenName}
                  onChange={(e) => setReopenName(e.target.value)}
                  required
                />
              </label>
              <p className="font-mono text-xs text-[var(--text-muted)]">
                Start date (fixed): {reactivatableObjective.startDate}
              </p>
              <DatePicker
                label="New end date"
                value={reopenEnd}
                onChange={setReopenEnd}
                min={maxDateString(
                  today as DateString,
                  minObjectiveEndDate(reactivatableObjective.startDate as DateString),
                )}
                calendarHints={{
                  anchorStart: reactivatableObjective.startDate as DateString,
                  bandFrom: reactivatableObjective.startDate as DateString,
                  bandTo: addDaysString(
                    reactivatableObjective.startDate as DateString,
                    MIN_OBJECTIVE_DAYS - 2,
                  ),
                  legend: [
                    `Fixed start: ${reactivatableObjective.startDate} (ring on calendar)`,
                    `Earliest end: ${minObjectiveEndDate(reactivatableObjective.startDate as DateString)} (${MIN_OBJECTIVE_DAYS} days inclusive)`,
                    `Must be ${today} or later to reopen.`,
                  ],
                }}
                required
              />
              {reopenError && <p className="text-xs text-[var(--danger)]">{reopenError}</p>}
              <button
                type="submit"
                className="btn btn-primary disabled:opacity-40"
                disabled={
                  !reopenEnd ||
                  inclusiveDayCount(
                    reactivatableObjective.startDate as DateString,
                    reopenEnd,
                  ) < MIN_OBJECTIVE_DAYS
                }
              >
                Reopen cycle
              </button>
            </form>
          )}

          <form
          className="card max-w-lg space-y-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setCreateError(null);
            if (!newStart || !newEnd) return;
            setConfirmAction("create");
          }}
        >
          <h2 className="font-medium">
            {reactivatableObjective ? "Or start a new cycle" : "Start a study cycle"}
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            No live cycle (end date has passed or none created yet). Pick start and end dates —
            today must fall within the range to work in Calendar / Syllabus.
          </p>
          <label className="block text-xs text-[var(--text-muted)]">
            Name
            <input
              className="input mt-1"
              placeholder="Name (e.g. GATE 2027)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
          </label>
          <DateRangePickers
            start={newStart}
            end={newEnd}
            onStartChange={setNewStart}
            onEndChange={setNewEnd}
            min={today as DateString}
            minSpanDays={MIN_OBJECTIVE_DAYS}
            startLabel="Start date"
            endLabel="End date"
            startLegendExtra={[`Cannot be before today (${today}).`]}
            endLegendExtra={[
              "Study cycles must span at least 14 days (start and end both count).",
              `Today (${today}) must fall within the range to use Calendar / Syllabus.`,
            ]}
          />
          {createError && <p className="text-xs text-[var(--danger)]">{createError}</p>}
          <button
            type="submit"
            className="btn btn-primary disabled:opacity-40"
            disabled={
              !newStart ||
              !newEnd ||
              newStart < today ||
              inclusiveDayCount(newStart, newEnd) < MIN_OBJECTIVE_DAYS
            }
          >
            Create cycle
          </button>
        </form>
        </>
      )}

      {liveObjective && (
        <p className="max-w-lg text-xs text-[var(--text-muted)]">
          To start a different cycle, use <strong>End cycle now</strong> or wait until after the end
          date. Only one live cycle at a time.
        </p>
      )}

      {archived.length > 0 && (
        <section>
          <h2 className="mb-1 font-medium">Past cycles</h2>
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            End date before today — view read-only history, then return to your live cycle.
          </p>
          <ul className="space-y-2">
            {archived.map((o) => {
              const isViewing = viewId === o.id && isArchiveView;
              const canReopen =
                !liveObjective && reactivatableObjective?.id === o.id;
              return (
                <li
                  key={o.id}
                  className={cn(
                    "card flex flex-wrap items-center justify-between gap-3 p-3",
                    canReopen && "border-[var(--accent)]/30",
                  )}
                >
                  <div>
                    <p className="font-medium">
                      {o.name}
                      {canReopen && (
                        <span className="ml-2 font-mono text-[10px] text-[var(--accent)]">
                          reopenable
                        </span>
                      )}
                    </p>
                    <p className="font-mono text-xs text-[var(--text-muted)]">
                      {o.startDate} → {o.endDate}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={isViewing ? "btn btn-primary text-xs" : "btn text-xs"}
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await openArchivedCycleForView(o.id);
                          router.push("/dashboard");
                          router.refresh();
                        })
                      }
                    >
                      {isViewing ? "Viewing" : "View history"}
                    </button>
                    <button
                      type="button"
                      className="btn text-xs text-[var(--danger)]"
                      disabled={pending}
                      onClick={() => {
                        setDeleteTarget(o);
                        setDeleteTypedName("");
                        setDeleteError(null);
                        setConfirmAction("delete");
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <ConfirmModal
        open={confirmAction === "edit"}
        title="Save study cycle changes?"
        description={`Update live cycle “${name.trim()}” to ${start} → ${end}? Calendar and syllabus use these dates.`}
        confirmLabel="Save changes"
        danger={false}
        pending={pending}
        onClose={() => setConfirmAction(null)}
        onConfirm={() =>
          startTransition(async () => {
            try {
              if (!start || !end) return;
              await updateActiveObjective({
                name: name.trim(),
                startDate: start,
                endDate: end,
              });
              setConfirmAction(null);
              router.refresh();
            } catch (err) {
              setEditError(err instanceof Error ? err.message : "Failed");
              setConfirmAction(null);
            }
          })
        }
      />

      <ConfirmModal
        open={confirmAction === "create"}
        title="Create this study cycle?"
        description={`Start “${newName.trim()}” from ${newStart} to ${newEnd}? Today must fall in this range to work in Calendar / Syllabus.`}
        confirmLabel="Create cycle"
        danger={false}
        pending={pending}
        onClose={() => setConfirmAction(null)}
        onConfirm={() =>
          startTransition(async () => {
            try {
              if (!newStart || !newEnd) return;
              await createObjective({
                name: newName.trim(),
                startDate: newStart,
                endDate: newEnd,
              });
              setNewName("");
              setNewStart("");
              setNewEnd("");
              setConfirmAction(null);
              router.refresh();
            } catch (err) {
              setCreateError(err instanceof Error ? err.message : "Failed");
              setConfirmAction(null);
            }
          })
        }
      />

      <ConfirmModal
        open={confirmAction === "reactivate"}
        title="Reopen this study cycle?"
        description={`Bring “${reopenName.trim()}” back as the live cycle with end date ${reopenEnd}? Start stays ${reactivatableObjective?.startDate}.`}
        confirmLabel="Reopen cycle"
        danger={false}
        pending={pending}
        onClose={() => setConfirmAction(null)}
        onConfirm={() =>
          startTransition(async () => {
            try {
              if (!reopenEnd) return;
              await reactivateLastArchivedObjective({
                name: reopenName.trim(),
                endDate: reopenEnd,
              });
              setConfirmAction(null);
              router.refresh();
            } catch (err) {
              setReopenError(err instanceof Error ? err.message : "Failed");
              setConfirmAction(null);
            }
          })
        }
      />

      <ConfirmModal
        open={confirmAction === "end"}
        title="End this cycle now?"
        description="The end date moves to yesterday and this cycle archives. You can then create a new cycle. Active phase planning stops with the archived cycle."
        confirmLabel="End cycle"
        danger={true}
        pending={pending}
        onClose={() => setConfirmAction(null)}
        onConfirm={() =>
          startTransition(async () => {
            await endActiveCycleNow();
            setConfirmAction(null);
            router.refresh();
          })
        }
      />

      <Modal
        open={confirmAction === "delete" && deleteTarget !== null}
        title="Delete archived cycle?"
        description={
          deleteTarget
            ? `Permanently removes “${deleteTarget.name}” (${deleteTarget.startDate} → ${deleteTarget.endDate}), including syllabus, plans, and logs. This cannot be undone.${
                !liveObjective && reactivatableObjective?.id === deleteTarget.id
                  ? " This is your reopenable cycle — after deletion you will need to create a new live cycle."
                  : ""
              }`
            : undefined
        }
        onClose={() => {
          setConfirmAction(null);
          setDeleteTarget(null);
          setDeleteTypedName("");
          setDeleteError(null);
        }}
      >
        <div className="space-y-3 pt-1">
          <label className="block text-sm">
            <span className="text-[var(--text-muted)]">
              Type the cycle name to confirm
            </span>
            <input
              type="text"
              className="input mt-1 w-full font-mono text-sm"
              value={deleteTypedName}
              autoComplete="off"
              disabled={pending}
              onChange={(e) => setDeleteTypedName(e.target.value)}
              placeholder={deleteTarget?.name ?? ""}
            />
          </label>
          {deleteError ? (
            <p className="text-xs text-[var(--danger)]">{deleteError}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() => {
                setConfirmAction(null);
                setDeleteTarget(null);
                setDeleteTypedName("");
                setDeleteError(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary bg-[var(--danger)]"
              disabled={
                pending ||
                !deleteTarget ||
                deleteTypedName.trim() !== deleteTarget.name
              }
              onClick={() =>
                startTransition(async () => {
                  if (!deleteTarget) return;
                  try {
                    await deleteArchivedObjective(deleteTarget.id);
                    setConfirmAction(null);
                    setDeleteTarget(null);
                    setDeleteTypedName("");
                    setDeleteError(null);
                    router.refresh();
                  } catch (err) {
                    setDeleteError(
                      err instanceof Error ? err.message : "Delete failed",
                    );
                  }
                })
              }
            >
              Delete permanently
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
