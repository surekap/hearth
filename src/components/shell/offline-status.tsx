"use client";

import { useSyncExternalStore } from "react";
import { CloudOff, RefreshCw, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

let wasOffline = false;

function getSnapshot() {
  if (typeof navigator === "undefined") {
    return wasOffline ? "online-after-offline" : "online";
  }

  if (!navigator.onLine) {
    wasOffline = true;
  }

  if (!navigator.onLine) return "offline";
  return wasOffline ? "online-after-offline" : "online";
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  function notify() {
    if (!navigator.onLine) {
      wasOffline = true;
    }
    callback();
  }

  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

export function OfflineStatus() {
  const status = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => "online"
  );
  const online = status !== "offline";
  const seenOffline = status === "online-after-offline";

  if (online && !seenOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed right-3 bottom-20 z-50 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-lg backdrop-blur md:bottom-4",
        online
          ? "border-[color-mix(in_oklch,var(--success),white_45%)] bg-card/95 text-foreground"
          : "border-[color-mix(in_oklch,var(--warning),white_35%)] bg-card/95 text-foreground"
      )}
    >
      {online ? (
        <Wifi className="size-3.5 text-[var(--success)]" />
      ) : (
        <CloudOff className="size-3.5 text-[var(--warning)]" />
      )}
      <span>
        {online
          ? "Back online. Refresh if recent uploads are missing."
          : "Offline. Recent pages may open, but uploads and AI need internet."}
      </span>
      {online && <RefreshCw className="size-3.5 text-muted-foreground" />}
    </div>
  );
}
