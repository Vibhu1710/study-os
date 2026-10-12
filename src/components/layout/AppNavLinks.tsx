"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const nav = [
  { href: "/", label: "Calendar" },
  { href: "/syllabus", label: "Syllabus" },
  { href: "/dashboard", label: "Dashboard" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1">
      {nav.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-[var(--bg-muted)] font-medium text-[var(--text)] ring-1 ring-[var(--border)]"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-muted)]/60 hover:text-[var(--text)]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
