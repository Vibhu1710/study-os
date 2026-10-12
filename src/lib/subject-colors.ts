/** Brand blue — calendar completion heat only; never assign to subjects. */
export const RESERVED_CALENDAR_HEAT_HEX = "#58a6ff";

/** Visually distinct hues (no blue; no near-duplicates within the list). */
export const SUBJECT_COLOR_PALETTE = [
  "#3fb950",
  "#d29922",
  "#f85149",
  "#a371f7",
  "#ff6e40",
  "#39c5cf",
  "#f778ba",
  "#e3b341",
  "#ff7b72",
  "#bc8cff",
] as const;

export const DEFAULT_SUBJECT_COLOR = SUBJECT_COLOR_PALETTE[0];

/** Minimum RGB distance between two subject colors. */
const MIN_SUBJECT_RGB_DISTANCE = 95;

/** Minimum hue separation when both colors are saturated. */
const MIN_SUBJECT_HUE_DELTA = 34;

export function normalizeHexColor(color: string): string {
  return color.trim().toLowerCase();
}

function expandHex(hex: string): string | null {
  const h = hex.replace(/^#/, "");
  if (h.length === 3) {
    return h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length === 6) return h;
  return null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const body = expandHex(hex);
  if (!body) return null;
  const n = Number.parseInt(body, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lig - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function parseColorToRgb(color: string): { r: number; g: number; b: number } | null {
  const c = color.trim().toLowerCase();
  if (c.startsWith("#")) return hexToRgb(c);
  const hsl = c.match(/^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/);
  if (hsl) {
    return hslToRgb(Number(hsl[1]), Number(hsl[2]), Number(hsl[3]));
  }
  return null;
}

function rgbToHsl(rgb: { r: number; g: number; b: number }): {
  h: number;
  s: number;
  l: number;
} {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = max === min ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/** True if this color is the reserved heat blue or visually too close for a subject. */
export function isReservedCalendarHeatColor(color: string): boolean {
  const normalized = normalizeHexColor(color);
  if (normalized === normalizeHexColor(RESERVED_CALENDAR_HEAT_HEX)) return true;

  const rgb = parseColorToRgb(color);
  const reserved = hexToRgb(RESERVED_CALENDAR_HEAT_HEX);
  if (!rgb || !reserved) return false;

  if (colorDistance(rgb, reserved) < 72) return true;

  const { h, s } = rgbToHsl(rgb);
  if (h >= 195 && h <= 235 && s > 0.35) return true;

  return false;
}

/** True if two subject colors are the same or too visually similar. */
export function subjectColorsTooSimilar(a: string, b: string): boolean {
  if (normalizeHexColor(a) === normalizeHexColor(b)) return true;

  const ra = parseColorToRgb(a);
  const rb = parseColorToRgb(b);
  if (!ra || !rb) return false;

  if (colorDistance(ra, rb) < MIN_SUBJECT_RGB_DISTANCE) return true;

  const ha = rgbToHsl(ra);
  const hb = rgbToHsl(rb);
  if (ha.s > 0.28 && hb.s > 0.28) {
    const dh = Math.abs(ha.h - hb.h);
    const hueDist = Math.min(dh, 360 - dh);
    if (hueDist < MIN_SUBJECT_HUE_DELTA) return true;
  }

  return false;
}

export function conflictsWithAnySubjectColor(
  color: string,
  otherSubjectColors: string[],
): boolean {
  if (isReservedCalendarHeatColor(color)) return true;
  return otherSubjectColors.some((other) => subjectColorsTooSimilar(color, other));
}

export function assertSubjectColorAllowed(
  color: string,
  otherSubjectColors: string[] = [],
) {
  if (isReservedCalendarHeatColor(color)) {
    throw new Error(
      "That color is reserved for the calendar heat map. Pick another hue for this subject.",
    );
  }
  if (conflictsWithAnySubjectColor(color, otherSubjectColors)) {
    throw new Error(
      "That color is too close to another subject. Pick a clearly different hue.",
    );
  }
}

/** Pick a palette / generated color distinct from every color already in use. */
export function pickSubjectColor(usedColors: string[]): string {
  for (const c of SUBJECT_COLOR_PALETTE) {
    if (!conflictsWithAnySubjectColor(c, usedColors)) return c;
  }
  let n = usedColors.length;
  for (let i = 0; i < 72; i++) {
    const hue = (n * 137.508) % 360;
    n += 1;
    if (hue >= 195 && hue <= 235) continue;
    const candidate = `hsl(${Math.round(hue)} 68% 52%)`;
    if (!conflictsWithAnySubjectColor(candidate, usedColors)) return candidate;
  }
  return DEFAULT_SUBJECT_COLOR;
}
