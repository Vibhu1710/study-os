export const RHYTHM_TODAY_UPDATED_EVENT = "study-os:rhythm-today-updated";

export type RhythmTodayUpdatedDetail = {
  date: string;
  completeCount: number;
  effectiveMinutes: number;
};
