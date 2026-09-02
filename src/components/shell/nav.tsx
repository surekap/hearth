"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Activity, FileText, MessageCircleQuestion, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Four destinations. Everything else is reachable from within them or from the
 * profile menu, so the top of the screen asks one question: where do you want
 * to look — the record, the trends, the documents, or the doctor?
 */
const items = [
  { href: "/", label: "Timeline", icon: Clock, covers: [] as string[] },
  { href: "/dashboard", label: "Trends", icon: Activity, covers: ["/metrics", "/labs"] },
  {
    href: "/documents",
    label: "Documents",
    icon: FileText,
    covers: ["/upload", "/images", "/export"],
  },
  { href: "/ask", label: "Ask AI", icon: MessageCircleQuestion, covers: [] as string[] },
];

/** Fixed-size hint so a pending tap shows feedback without shifting layout. */
function PendingDot() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 rounded-full bg-primary transition-opacity duration-150",
        pending ? "animate-pulse opacity-100 [animation-delay:100ms]" : "opacity-0"
      )}
    />
  );
}

export function MainNav() {
  const pathname = usePathname();

  function isActive(item: (typeof items)[number]) {
    if (item.href === "/") return pathname === "/";
    return (
      pathname.startsWith(item.href) || item.covers.some((prefix) => pathname.startsWith(prefix))
    );
  }

  return (
    <nav
      aria-label="Primary"
      className="-mb-px flex max-w-full min-w-0 gap-0.5 sm:gap-1"
    >
      {items.map((item) => {
        const { href, label, icon: Icon } = item;
        const active = isActive(item);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 whitespace-nowrap border-b-2 px-1 pb-1.5 pt-1 text-[11px] font-medium transition-all duration-200 select-none active:scale-95 active:duration-75 sm:h-11 sm:flex-initial sm:flex-row sm:gap-1.5 sm:px-3.5 sm:py-0 sm:text-sm",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <Icon
              className={cn(
                "size-4 transition-transform duration-200 group-hover:-translate-y-0.5",
                active && "text-primary"
              )}
            />
            <span className="truncate">{label}</span>
            <span className="absolute right-1 top-1 sm:static">
              <PendingDot />
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
