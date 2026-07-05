"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  FileText,
  FlaskConical,
  MessageCircleQuestion,
  Clock,
  Upload,
  Pill,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Timeline", icon: Clock },
  { href: "/dashboard", label: "Dashboard", icon: Activity },
  { href: "/labs", label: "Labs", icon: FlaskConical },
  { href: "/meds", label: "Meds", icon: Pill },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/ask", label: "Ask AI", icon: MessageCircleQuestion },
];

export function MainNav() {
  const pathname = usePathname();
  const mobileItems = items.filter((item) =>
    ["/", "/dashboard", "/labs", "/upload", "/ask"].includes(item.href)
  );

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <>
      <nav className="scrollbar-none -mb-px hidden gap-1 overflow-x-auto md:flex">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-all duration-200",
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
              {label}
            </Link>
          );
        })}
      </nav>
      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 gap-1 rounded-lg border bg-background/92 p-1 shadow-xl shadow-primary/15 backdrop-blur-xl md:hidden">
        {mobileItems.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[11px] font-medium transition-all",
                active
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
