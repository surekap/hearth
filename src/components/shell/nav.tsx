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
  Download,
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
  { href: "/export", label: "Export", icon: Download },
];

export function MainNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <nav
      aria-label="Primary"
      className="scrollbar-none -mb-px flex gap-1 overflow-x-auto overscroll-x-contain"
    >
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "group flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 text-sm font-medium transition-all duration-200 sm:px-3",
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
  );
}
