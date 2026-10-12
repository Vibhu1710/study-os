"use client";

import { useEffect } from "react";

/** Keeps --app-header-height in sync with the sticky shell header for dashboard panels. */
export function AppShellStickyOffset() {
  useEffect(() => {
    const header = document.getElementById("app-shell-header");
    if (!header) return;

    const sync = () => {
      document.documentElement.style.setProperty(
        "--app-header-height",
        `${header.getBoundingClientRect().height}px`,
      );
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(header);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  return null;
}
