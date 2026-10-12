import type { SubjectDaySlice } from "@/components/calendar/ContributionCalendar";
import { roundWeightTenth } from "@/lib/weight";

export type CalendarDayPresentation = {
  background: string;
  bottomStripe: string | null;
  topStripe: string | null;
  /** 0–1 horizontal span for edge stripes (today: shrinks/grows with progress). */
  topStripeWidthFrac: number;
  bottomStripeWidthFrac: number;
  bottomWeightLabel: number | null;
  topWeightLabel: number | null;
};

export function subjectStripeGradient(slices: SubjectDaySlice[]): string | null {
  if (slices.length === 0) return null;
  if (slices.length === 1) return slices[0].color;
  const total = slices.reduce((sum, x) => sum + x.weight, 0);
  return `linear-gradient(90deg, ${slices
    .map((s, i) => {
      const start = slices.slice(0, i).reduce((sum, x) => sum + x.weight, 0);
      const end = start + s.weight;
      const a = total > 0 ? (start / total) * 100 : 0;
      const b = total > 0 ? (end / total) * 100 : 100;
      return `${s.color} ${a}% ${b}%`;
    })
    .join(", ")})`;
}

/** Map completed weight to 0–1 using objective min–max (better when weights cluster). */
export function completedWeightHeatIntensity(
  weight: number,
  minCompleted: number,
  maxCompleted: number,
): number {
  if (weight <= 0) return 0;
  const max = Math.max(maxCompleted, weight);
  const min = minCompleted;
  if (max <= min) return 1;
  const linear = (weight - min) / (max - min);
  return Math.pow(Math.min(1, Math.max(0, linear)), 0.72);
}

/** Layered blue ramp — deep → mid → soft accent at max (theme-safe, not piercing). */
export function completionHeatFill(intensity: number) {
  const t = Math.min(1, Math.max(0, intensity));
  const base = "var(--phase-cell-base)";

  if (t < 0.4) {
    const u = t / 0.4;
    const mix = Math.round(10 + u * 32);
    return `color-mix(in srgb, var(--calendar-heat-deep) ${mix}%, ${base})`;
  }
  if (t < 0.78) {
    const u = (t - 0.4) / 0.38;
    const deepMix = Math.round(38 - u * 18);
    const midMix = Math.round(12 + u * 40);
    const layer = `color-mix(in srgb, var(--calendar-heat) ${midMix}%, ${base})`;
    return `color-mix(in srgb, var(--calendar-heat-deep) ${deepMix}%, ${layer})`;
  }
  const u = (t - 0.78) / 0.22;
  const midLayer = `color-mix(in srgb, var(--calendar-heat) ${Math.round(48 + u * 18)}%, ${base})`;
  const brightMix = Math.round(14 + u * 26);
  return `color-mix(in srgb, var(--calendar-heat-bright) ${brightMix}%, ${midLayer})`;
}

const OBJECTIVE_CELL_BASE =
  "color-mix(in srgb, #ffffff 9%, var(--phase-cell-base))";

export function getCalendarDayPresentation(
  dateKey: string,
  today: string,
  opts: {
    outOfObjective: boolean;
    completedWeight: number;
    plannedWeight: number;
    completedSlices: SubjectDaySlice[];
    plannedSlices: SubjectDaySlice[];
    maxObjectiveCompletedWeight: number;
    minObjectiveCompletedWeight: number;
  },
): CalendarDayPresentation {
  const {
    outOfObjective,
    completedSlices,
    plannedSlices,
    maxObjectiveCompletedWeight,
    minObjectiveCompletedWeight,
  } = opts;
  const completedWeight = roundWeightTenth(opts.completedWeight);
  const plannedWeight = roundWeightTenth(opts.plannedWeight);

  const isToday = dateKey === today;
  const isPast = dateKey < today;

  const showCompletedVisual = isPast || (isToday && completedWeight > 0);
  const showPlannedVisual =
    (dateKey > today && plannedWeight > 0) || (isToday && plannedWeight > 0);

  let background = "var(--bg-muted)";
  if (!outOfObjective) {
    if (showCompletedVisual && completedWeight > 0) {
      const intensity = completedWeightHeatIntensity(
        completedWeight,
        minObjectiveCompletedWeight,
        maxObjectiveCompletedWeight,
      );
      background = completionHeatFill(intensity);
    } else {
      background = OBJECTIVE_CELL_BASE;
    }
  }

  const bottomStripe =
    showCompletedVisual && completedSlices.length > 0
      ? subjectStripeGradient(completedSlices)
      : null;
  const topStripe =
    showPlannedVisual && plannedSlices.length > 0
      ? subjectStripeGradient(plannedSlices)
      : null;

  let topStripeWidthFrac = topStripe ? 1 : 0;
  let bottomStripeWidthFrac = bottomStripe ? 1 : 0;

  if (isToday) {
    const dayBudget = plannedWeight + completedWeight;
    if (dayBudget > 0 && completedWeight > 0 && plannedWeight > 0) {
      topStripeWidthFrac = plannedWeight / dayBudget;
      bottomStripeWidthFrac = completedWeight / dayBudget;
    } else if (plannedWeight > 0) {
      topStripeWidthFrac = 1;
      bottomStripeWidthFrac = 0;
    } else if (completedWeight > 0) {
      topStripeWidthFrac = 0;
      bottomStripeWidthFrac = 1;
    }
  }

  return {
    background,
    bottomStripe,
    topStripe,
    topStripeWidthFrac,
    bottomStripeWidthFrac,
    bottomWeightLabel:
      showCompletedVisual && completedWeight > 0 ? completedWeight : null,
    topWeightLabel: showPlannedVisual && plannedWeight > 0 ? plannedWeight : null,
  };
}
