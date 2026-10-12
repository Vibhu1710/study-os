import Link from "next/link";
import { cn } from "@/lib/cn";

export type WorkflowStep = {
  id: string;
  label: string;
  done: boolean;
  href?: string;
  hint?: string;
};

export function WorkflowSteps({ steps }: { steps: WorkflowStep[] }) {
  const current = steps.find((s) => !s.done)?.id ?? steps[steps.length - 1]?.id;

  return (
    <ol className="card flex flex-col gap-2 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
      {steps.map((step, i) => (
        <li key={step.id} className="flex min-w-0 flex-1 items-start gap-2 sm:items-center">
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px]",
              step.done
                ? "bg-[var(--accent-green)] text-[#0d1117]"
                : step.id === current
                  ? "bg-[var(--accent)] text-[#0d1117]"
                  : "bg-[var(--bg-muted)] text-[var(--text-muted)]",
            )}
          >
            {step.done ? "✓" : i + 1}
          </span>
          <div className="min-w-0">
            {step.href && !step.done ? (
              <Link href={step.href} className="text-sm font-medium hover:text-[var(--accent)]">
                {step.label}
              </Link>
            ) : (
              <span className={cn("text-sm", step.done && "text-[var(--text-muted)]")}>
                {step.label}
              </span>
            )}
            {step.hint && (
              <p className="font-mono text-[10px] text-[var(--text-muted)]">{step.hint}</p>
            )}
          </div>
          {i < steps.length - 1 && (
            <span className="hidden text-[var(--border)] sm:ml-2 sm:inline">→</span>
          )}
        </li>
      ))}
    </ol>
  );
}
