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
  return (
    <nav className="scrollbar-none -mb-px flex gap-1 overflow-x-auto">
      {items.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
              active
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
