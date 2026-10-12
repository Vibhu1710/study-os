"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CompletionDates } from "@/lib/completion-dates";

const emptyDates: CompletionDates = { byTopicId: {}, bySubtopicId: {} };

type CompletionDatesContextValue = {
  completionDates: CompletionDates;
  today: string;
  objectiveId: string | null;
  patchPlanToggle: (input: {
    topicId: string;
    subtopicId: string | null;
    complete: boolean;
  }) => void;
};

const CompletionDatesContext = createContext<CompletionDatesContextValue | null>(
  null,
);

export function CompletionDatesProvider({
  children,
  objectiveId,
  today,
  initialDates,
}: {
  children: React.ReactNode;
  objectiveId: string | null;
  today: string;
  initialDates: CompletionDates;
}) {
  const [completionDates, setCompletionDates] = useState(initialDates);
  const serverKey = useMemo(() => JSON.stringify(initialDates), [initialDates]);

  useEffect(() => {
    setCompletionDates(initialDates);
  }, [objectiveId, serverKey, initialDates]);

  const patchPlanToggle = useCallback(
    ({
      topicId,
      subtopicId,
      complete,
    }: {
      topicId: string;
      subtopicId: string | null;
      complete: boolean;
    }) => {
      setCompletionDates((prev) => {
        const byTopicId = { ...prev.byTopicId };
        const bySubtopicId = { ...prev.bySubtopicId };
        if (subtopicId) {
          if (complete) bySubtopicId[subtopicId] = today;
          else if (bySubtopicId[subtopicId] === today) delete bySubtopicId[subtopicId];
        } else {
          if (complete) byTopicId[topicId] = today;
          else if (byTopicId[topicId] === today) delete byTopicId[topicId];
        }
        return { byTopicId, bySubtopicId };
      });
    },
    [today],
  );

  const value = useMemo(
    () => ({
      completionDates,
      today,
      objectiveId,
      patchPlanToggle,
    }),
    [completionDates, today, objectiveId, patchPlanToggle],
  );

  return (
    <CompletionDatesContext.Provider value={value}>
      {children}
    </CompletionDatesContext.Provider>
  );
}

export function useCompletionDates(): CompletionDatesContextValue {
  const ctx = useContext(CompletionDatesContext);
  if (!ctx) {
    return {
      completionDates: emptyDates,
      today: "",
      objectiveId: null,
      patchPlanToggle: () => {},
    };
  }
  return ctx;
}
