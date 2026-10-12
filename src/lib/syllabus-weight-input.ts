import { roundWeightTenth } from "@/lib/weight";

/** Allow empty or a single positive decimal while typing. */
export function sanitizeWeightInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  const intPart = cleaned.slice(0, dot);
  const fracPart = cleaned.slice(dot + 1).replace(/\./g, "");
  return fracPart.length > 0 ? `${intPart}.${fracPart}` : `${intPart}.`;
}

/** Parse for save; rejects empty, non-numeric, zero, or negative. */
export function parsePositiveWeight(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = parseFloat(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return roundWeightTenth(n);
}

/** Server-side guard for topic/subtopic weight fields. */
export function assertFinitePositiveWeight(
  value: unknown,
  label = "Weight",
): number {
  if (typeof value === "string") {
    const parsed = parsePositiveWeight(value);
    if (parsed == null) {
      throw new Error(`${label} must be a positive number.`);
    }
    return parsed;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return roundWeightTenth(value);
}
