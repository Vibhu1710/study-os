"use server";

import { revalidatePath } from "next/cache";
import {
  editLogBackfillLeafTopic,
  editLogBackfillSubtopic,
  editLogRelogLeafTopic,
  editLogRelogSubtopic,
  editLogRemoveLeafTopic,
  editLogRemoveSubtopic,
  editLogUpcomingScheduleDate,
  type EditLogSaveResult,
} from "@/lib/services/edit-log";

function revalidate() {
  revalidatePath("/");
  revalidatePath("/syllabus");
  revalidatePath("/dashboard");
}

export async function fetchEditLogScheduleHint(
  objectiveId: string,
  topicId: string,
): Promise<string | null> {
  return editLogUpcomingScheduleDate(objectiveId, topicId);
}

export async function saveEditLogBackfill(
  topicId: string,
  subtopicId: string | null,
  date: string,
): Promise<EditLogSaveResult> {
  const result = subtopicId
    ? await editLogBackfillSubtopic(subtopicId, date)
    : await editLogBackfillLeafTopic(topicId, date);
  revalidate();
  return result;
}

export async function saveEditLogRelog(
  topicId: string,
  subtopicId: string | null,
  fromDate: string,
  newDate: string,
): Promise<EditLogSaveResult> {
  void fromDate;
  const result = subtopicId
    ? await editLogRelogSubtopic(subtopicId, newDate)
    : await editLogRelogLeafTopic(topicId, newDate);
  revalidate();
  return result;
}

export async function saveEditLogRemove(
  topicId: string,
  subtopicId: string | null,
): Promise<EditLogSaveResult> {
  const result = subtopicId
    ? await editLogRemoveSubtopic(subtopicId)
    : await editLogRemoveLeafTopic(topicId);
  revalidate();
  return result;
}
