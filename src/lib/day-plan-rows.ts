import type { CompletionDates } from "@/lib/completion-dates";

export type SubtopicRowDisplay = {
  doneOn: string | null;
  /** Checked / logged (committed or volatile today). */
  isDone: boolean;
  /** Green row highlight — only when viewing a past day that is the log date. */
  loggedOnViewDay: boolean;
  /** Green ✓ without row highlight — done on another past day. */
  showPastTick: boolean;
  showDash: boolean;
  showCheckbox: boolean;
  checkboxChecked: boolean;
  loggedLabel: string;
};

export function subtopicRowDisplay(
  doneOn: string | null,
  ctx: {
    viewDate: string;
    today: string;
    isToday: boolean;
    isPast: boolean;
    canEdit: boolean;
  },
): SubtopicRowDisplay {
  const { viewDate, today, isToday, isPast, canEdit } = ctx;
  const committedOnPastDay = Boolean(doneOn && doneOn < today);
  const volatileToday = isToday && doneOn === today;
  const loggedOnViewDay = isPast && doneOn === viewDate;
  const isDone = isToday
    ? committedOnPastDay || volatileToday
    : Boolean(doneOn && doneOn < today);

  if (isPast) {
    if (loggedOnViewDay) {
      return {
        doneOn,
        isDone: true,
        loggedOnViewDay: true,
        showPastTick: false,
        showDash: false,
        showCheckbox: false,
        checkboxChecked: false,
        loggedLabel: viewDate,
      };
    }
    if (doneOn && doneOn < today) {
      return {
        doneOn,
        isDone: true,
        loggedOnViewDay: false,
        showPastTick: true,
        showDash: false,
        showCheckbox: false,
        checkboxChecked: false,
        loggedLabel: doneOn,
      };
    }
    return {
      doneOn: null,
      isDone: false,
      loggedOnViewDay: false,
      showPastTick: false,
      showDash: true,
      showCheckbox: false,
      checkboxChecked: false,
      loggedLabel: "",
    };
  }

  const committedEarlier = committedOnPastDay;
  const isFuture = viewDate > today;

  if (isToday || isFuture) {
    return {
      doneOn,
      isDone: committedEarlier || volatileToday,
      loggedOnViewDay: false,
      showPastTick: committedEarlier,
      showDash: isFuture && !committedEarlier && !volatileToday,
      showCheckbox: isToday && canEdit && !committedEarlier,
      checkboxChecked: committedEarlier || volatileToday,
      loggedLabel: committedEarlier ? (doneOn ?? "") : "",
    };
  }

  return {
    doneOn,
    isDone: false,
    loggedOnViewDay: false,
    showPastTick: false,
    showDash: true,
    showCheckbox: false,
    checkboxChecked: false,
    loggedLabel: "",
  };
}

export function leafTopicVisibleOnPastDay(
  hasSubtopics: boolean,
  viewDate: string,
  topicId: string,
  completionDates: CompletionDates,
  today: string,
): boolean {
  if (hasSubtopics) return true;
  if (viewDate >= today) return true;
  return completionDates.byTopicId[topicId] === viewDate;
}
