"use client";

import type { CSSProperties, ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/cn";

export type PlanTopicDragData = {
  kind: "day-plan" | "phase-schedule";
  topicId: string;
  topicTitle: string;
  fromDate?: string;
  subjectName?: string;
  subjectColor?: string;
  weightLabel?: string;
};

export function dayDropId(date: string) {
  return `day:${date}`;
}

export function dayPanelDropId(date: string) {
  return `day-panel:${date}`;
}

export function parseDayDropId(id: string): string | null {
  if (id.startsWith("day-panel:")) return id.slice("day-panel:".length);
  if (id.startsWith("day:")) return id.slice(4);
  return null;
}

export function planTopicDragId(topicId: string) {
  return `plan-topic:${topicId}`;
}

export function phaseTopicDragId(topicId: string) {
  return `phase-topic:${topicId}`;
}

export function parsePlanTopicDragId(
  id: string,
): { kind: "day-plan" | "phase-schedule"; topicId: string } | null {
  if (id.startsWith("plan-topic:")) {
    return { kind: "day-plan", topicId: id.slice("plan-topic:".length) };
  }
  if (id.startsWith("phase-topic:")) {
    return { kind: "phase-schedule", topicId: id.slice("phase-topic:".length) };
  }
  return null;
}

export function PlanTopicDragPreview({
  title,
  subjectName,
  subjectColor,
  weightLabel,
}: {
  title: string;
  subjectName?: string;
  subjectColor?: string;
  weightLabel?: string;
}) {
  return (
    <div
      className="pointer-events-none w-[min(calc(100vw-2rem),20rem)] rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-2xl ring-2 ring-white/20"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: subjectColor ?? "var(--accent)",
      }}
    >
      <p className="text-sm font-medium text-[var(--text)]">{title}</p>
      {(subjectName || weightLabel) && (
        <p className="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">
          {[subjectName, weightLabel].filter(Boolean).join(" · ")}
        </p>
      )}
      <p className="mt-2 font-mono text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
        Drop on a day
      </p>
    </div>
  );
}

export function DraggablePlanTopicCard({
  topicId,
  topicTitle,
  fromDate,
  subjectName,
  subjectColor,
  weightLabel,
  disabled,
  className,
  style,
  children,
}: {
  topicId: string;
  topicTitle: string;
  fromDate: string;
  subjectName?: string;
  subjectColor?: string;
  weightLabel?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: planTopicDragId(topicId),
    data: {
      kind: "day-plan",
      topicId,
      topicTitle,
      fromDate,
      subjectName,
      subjectColor,
      weightLabel,
    } satisfies PlanTopicDragData,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        className,
        !disabled && "cursor-grab touch-none active:cursor-grabbing",
        isDragging && "opacity-25",
      )}
      {...(!disabled ? { ...listeners, ...attributes } : {})}
    >
      {children}
    </div>
  );
}

export function DraggablePhaseTopicRow({
  topicId,
  topicTitle,
  subjectName,
  subjectColor,
  weightLabel,
  disabled,
  className,
  children,
}: {
  topicId: string;
  topicTitle: string;
  subjectName: string;
  subjectColor: string;
  weightLabel: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: phaseTopicDragId(topicId),
    data: {
      kind: "phase-schedule",
      topicId,
      topicTitle,
      subjectName,
      subjectColor,
      weightLabel,
    } satisfies PlanTopicDragData,
    disabled,
  });

  return (
    <tr
      ref={setNodeRef}
      className={cn(
        className,
        !disabled && "cursor-grab touch-none active:cursor-grabbing",
        isDragging && "opacity-25",
      )}
      {...(!disabled ? { ...listeners, ...attributes } : {})}
    >
      {children}
    </tr>
  );
}

export function DroppableCalendarDay({
  date,
  enabled,
  highlighted,
  children,
}: {
  date: string;
  enabled: boolean;
  highlighted?: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: dayDropId(date),
    disabled: !enabled,
  });

  const showHighlight = enabled && (highlighted || isOver);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "h-full min-h-[2.125rem] w-full rounded-[4px]",
        showHighlight &&
          "z-[3] ring-2 ring-[var(--accent-green)] ring-offset-2 ring-offset-[var(--bg-muted)]",
      )}
    >
      {children}
    </div>
  );
}

/** Drop zone for the day target panel (same date as selected in the panel). */
export function DroppableDayTargetPanel({
  date,
  enabled,
  dropHighlighted,
  className,
  children,
}: {
  date: string;
  enabled: boolean;
  dropHighlighted?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: dayPanelDropId(date),
    disabled: !enabled,
  });

  const showHighlight = enabled && (dropHighlighted || isOver);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        className,
        showHighlight &&
          "ring-2 ring-[var(--accent-green)] ring-offset-2 ring-offset-[var(--bg)]",
      )}
    >
      {children}
    </div>
  );
}
