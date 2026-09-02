"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * A thin bar along the top edge while a navigation is in flight. Starts on
 * any same-origin link tap, finishes when the pathname changes. Delayed by
 * 120ms so instant transitions never flash it.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPath = useRef(pathname);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a[href]");
      if (!anchor || anchor.getAttribute("target") === "_blank") return;
      if (anchor.hasAttribute("download")) return;
      const url = new URL((anchor as HTMLAnchorElement).href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("loading"), 120);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (timer.current) clearTimeout(timer.current);
    setState((s) => (s === "loading" ? "done" : "idle"));
    const t = setTimeout(() => setState("idle"), 260);
    return () => clearTimeout(t);
  }, [pathname]);

  // Safety valve: a navigation that never resolves must not leave a bar stuck.
  useEffect(() => {
    if (state !== "loading") return;
    const t = setTimeout(() => setState("idle"), 15_000);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div
        className="h-0.5 origin-left bg-primary shadow-[0_0_8px_var(--primary)]"
        style={{
          transform: state === "idle" ? "scaleX(0)" : state === "loading" ? "scaleX(0.85)" : "scaleX(1)",
          opacity: state === "idle" ? 0 : 1,
          transition:
            state === "loading"
              ? "transform 6s cubic-bezier(0.1, 0.6, 0.2, 1), opacity 120ms"
              : state === "done"
                ? "transform 160ms ease-out, opacity 200ms 120ms"
                : "none",
        }}
      />
    </div>
  );
}
