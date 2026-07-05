import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MascotMood = "calm" | "happy" | "thinking" | "concerned";

const moodClasses: Record<MascotMood, string> = {
  calm: "[--mascot-accent:var(--primary)]",
  happy: "[--mascot-accent:var(--success)]",
  thinking: "[--mascot-accent:var(--info)]",
  concerned: "[--mascot-accent:var(--warning)]",
};

export function HearthMascot({
  mood = "calm",
  className,
  label = "Pip, Hearth's helper",
}: {
  mood?: MascotMood;
  className?: string;
  label?: string;
}) {
  const concerned = mood === "concerned";
  const happy = mood === "happy";

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 120 120"
      className={cn("size-16 shrink-0", moodClasses[mood], className)}
    >
      <path
        d="M60 13c19 0 35 15 35 34 0 30-25 52-35 60-10-8-35-30-35-60 0-19 16-34 35-34Z"
        fill="var(--primary)"
      />
      <path
        d="M60 13c19 0 35 15 35 34 0 30-25 52-35 60-10-8-35-30-35-60 0-19 16-34 35-34Z"
        fill="var(--mascot-accent)"
        opacity="0.28"
      />
      <path
        d="M38 51c5-11 15-16 22-16s17 5 22 16"
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeWidth="5"
        opacity="0.35"
      />
      <circle cx="46" cy="56" r="8" fill="white" />
      <circle cx="74" cy="56" r="8" fill="white" />
      <circle cx="48" cy="57" r="3" fill="oklch(0.18 0.035 252)" />
      <circle cx="72" cy="57" r="3" fill="oklch(0.18 0.035 252)" />
      <path
        d={concerned ? "M47 80c8-5 18-5 26 0" : happy ? "M45 76c7 9 23 9 30 0" : "M48 77c8 5 16 5 24 0"}
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeWidth="5"
      />
      <path
        d="M60 65l-6 6h12l-6-6Z"
        fill="white"
        opacity="0.86"
      />
    </svg>
  );
}

export function EmptyState({
  title,
  description,
  children,
  mood = "calm",
}: {
  title: string;
  description: string;
  children?: ReactNode;
  mood?: MascotMood;
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-14 text-center">
      <HearthMascot mood={mood} className="animate-in zoom-in-95 duration-300" />
      <div className="grid max-w-md gap-1">
        <p className="font-heading text-lg font-medium">{title}</p>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
