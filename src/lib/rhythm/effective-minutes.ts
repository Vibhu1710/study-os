export type RhythmSandglassConfig = {
  oddMinutes: number;
  evenMinutes: number;
};

export type RhythmSessionInput = {
  startsWithOddCycle: boolean;
  fullCycleCount: number;
  startPartialTenths: number;
  endPartialTenths: number;
};

/** Minutes for one flip at odd (true) or even (false) slot. */
function minutesForSlot(isOdd: boolean, cfg: RhythmSandglassConfig): number {
  return isOdd ? cfg.oddMinutes : cfg.evenMinutes;
}

/** Effective study minutes from sandglass inputs + global/frozen config. */
export function rhythmEffectiveMinutes(
  session: RhythmSessionInput,
  cfg: RhythmSandglassConfig,
): number {
  let total = 0;
  let isOdd = session.startsWithOddCycle;

  if (session.startPartialTenths > 0) {
    const remaining = session.startPartialTenths / 10;
    total += minutesForSlot(isOdd, cfg) * remaining;
    isOdd = !isOdd;
  }

  for (let i = 0; i < session.fullCycleCount; i++) {
    total += minutesForSlot(isOdd, cfg);
    isOdd = !isOdd;
  }

  if (session.endPartialTenths > 0) {
    const moved = session.endPartialTenths / 10;
    total += minutesForSlot(isOdd, cfg) * moved;
  }

  return Math.round(total * 10) / 10;
}

export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function isSameDayClockOutAfterStart(
  startTime: string,
  endTime: string,
): boolean {
  return parseTimeToMinutes(endTime) > parseTimeToMinutes(startTime);
}

export function rhythmSessionSpanMinutes(startTime: string, endTime: string): number {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (end <= start) return 0;
  return end - start;
}

export function rhythmBreakMinutes(
  session: RhythmSessionInput & { startTime: string; endTime: string },
  cfg: RhythmSandglassConfig,
): number {
  const span = rhythmSessionSpanMinutes(session.startTime, session.endTime);
  const effective = rhythmEffectiveMinutes(session, cfg);
  return Math.round(Math.max(0, span - effective) * 10) / 10;
}

/** e.g. "4 hours 20 minutes", "45 minutes", "2 hours" */
export function formatRhythmDuration(minutes: number): string {
  if (minutes <= 0) return "0 minutes";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return m === 1 ? "1 minute" : `${m} minutes`;
  if (m === 0) return h === 1 ? "1 hour" : `${h} hours`;
  const hourPart = h === 1 ? "1 hour" : `${h} hours`;
  const minPart = m === 1 ? "1 minute" : `${m} minutes`;
  return `${hourPart} ${minPart}`;
}

/** Compact axis / tight UI (e.g. 4h 20m). */
export function formatRhythmDurationCompact(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatTime12(time: string): string {
  const mins = parseTimeToMinutes(time);
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const am = h24 < 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${am ? "AM" : "PM"}`;
}

export type Time12Parts = {
  hour12: number;
  minute: number;
  pm: boolean;
};

export function splitTime12(hhmm: string): Time12Parts {
  const mins = parseTimeToMinutes(hhmm);
  const h24 = Math.floor(mins / 60) % 24;
  const minute = mins % 60;
  const pm = h24 >= 12;
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour12, minute, pm };
}

export function joinTime12(parts: Time12Parts): string {
  let h24 = parts.hour12 % 12;
  if (parts.pm) h24 += 12;
  return `${h24.toString().padStart(2, "0")}:${parts.minute.toString().padStart(2, "0")}`;
}

/** Logged sand cycles as a decimal (full flips + partial tenths). */
export function rhythmLoggedSandCycles(session: RhythmSessionInput): number {
  let total = session.fullCycleCount;
  if (session.endPartialTenths > 0) total += session.endPartialTenths / 10;
  if (session.startPartialTenths > 0) {
    total += session.startPartialTenths / 10;
  }
  return Math.round(total * 100) / 100;
}

export function formatSandCycleTotal(value: number): string {
  if (value <= 0) return "0";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Next calendar day YYYY-MM-DD */
export function nextDateString(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function previousDateString(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Default first-flip parity from yesterday (continue partial flip or next in sequence). */
export function defaultStartsWithOddFromPrevious(prev: {
  startsWithOddCycle: boolean;
  fullCycleCount: number;
  startPartialTenths: number;
  endPartialTenths: number;
}): boolean {
  let isOdd = prev.startsWithOddCycle;
  if (prev.startPartialTenths > 0) isOdd = !isOdd;
  for (let i = 0; i < prev.fullCycleCount; i++) isOdd = !isOdd;
  if (prev.endPartialTenths > 0) return isOdd;
  return !isOdd;
}

export function defaultStartPartialTenthsFromPrevious(prev: {
  endPartialTenths: number;
}): number {
  if (prev.endPartialTenths <= 0) return 0;
  return 10 - prev.endPartialTenths;
}
