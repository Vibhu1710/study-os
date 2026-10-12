import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import {
  getCurrentObjectiveId,
  getWorkspaceState,
  listObjectives,
} from "@/lib/actions/objectives";
import { CompletionDatesProvider } from "@/lib/completion-dates-context";
import { fetchCompletionDates } from "@/lib/completion-dates";
import { toDateString } from "@/lib/dates";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Study OS",
  description: "Objective-driven syllabus, phases, and velocity tracking",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const today = toDateString(new Date());
  const [objectiveList, currentId, workspace] = await Promise.all([
    listObjectives(),
    getCurrentObjectiveId(),
    getWorkspaceState(),
  ]);
  const completionDates = currentId
    ? await fetchCompletionDates(currentId)
    : { byTopicId: {}, bySubtopicId: {} };

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <CompletionDatesProvider
          objectiveId={currentId}
          today={today}
          initialDates={completionDates}
        >
          <AppShell
            objectives={objectiveList}
            currentObjectiveId={currentId}
            activeObjectiveId={workspace.activeId}
            isArchiveView={workspace.isArchiveView}
          >
            {children}
          </AppShell>
        </CompletionDatesProvider>
      </body>
    </html>
  );
}
