"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import {
  buildPhaseOutlinePathD,
  measurePhaseGridLayout,
} from "@/lib/phase-calendar-outline";

const OUTLINE_RADIUS = 8;

export function PhaseBlockSvgOutline({
  gridRef,
  cellKeys,
  phaseStart,
  phaseEnd,
  objectiveStart,
  objectiveEnd,
  className,
}: {
  gridRef: RefObject<HTMLElement | null>;
  cellKeys: string[];
  phaseStart: string | null | undefined;
  phaseEnd: string | null | undefined;
  objectiveStart: string;
  objectiveEnd: string;
  className?: string;
}) {
  const [pathD, setPathD] = useState("");
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || !phaseStart || !phaseEnd) {
      setPathD("");
      return;
    }

    const update = () => {
      const layout = measurePhaseGridLayout(grid);
      if (!layout) {
        setPathD("");
        return;
      }
      const rect = grid.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
      setPathD(
        buildPhaseOutlinePathD(
          cellKeys,
          phaseStart,
          phaseEnd,
          objectiveStart,
          objectiveEnd,
          layout,
          OUTLINE_RADIUS,
        ),
      );
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [
    gridRef,
    cellKeys,
    phaseStart,
    phaseEnd,
    objectiveStart,
    objectiveEnd,
  ]);

  if (!pathD || size.w <= 0 || size.h <= 0) return null;

  return (
    <svg
      className={className}
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
      aria-hidden
      overflow="visible"
    >
      <path
        d={pathD}
        fill="none"
        stroke="var(--phase-gap-marker)"
        strokeWidth="var(--phase-outline-width, 1)"
        strokeDasharray="5 4"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
