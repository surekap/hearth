"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Bed,
  CalendarDays,
  ClipboardList,
  Droplets,
  Dumbbell,
  Eye,
  HeartPulse,
  Minus,
  Pill,
  Smile,
  Stethoscope,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Line as RechartsLine,
  LineChart as RechartsLineChart,
  ReferenceLine as RechartsReferenceLine,
  ResponsiveContainer as RechartsResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis as RechartsXAxis,
  YAxis as RechartsYAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/mascot";
import { cn } from "@/lib/utils";
import type {
  AdaptiveDashboardData,
  DashboardFocus,
  DashboardMarker,
  DashboardSystemWidget,
  MetricCard,
} from "@/lib/dashboard";

const RANGES = [
  { key: "3m", label: "3 months" },
  { key: "6m", label: "6 months" },
  { key: "1y", label: "1 year" },
  { key: "3y", label: "3 years" },
  { key: "all", label: "All time" },
];

type SystemMedia = {
  image: string;
  video?: string;
  position: string;
  tone: "light" | "dark";
};

const SYSTEM_MEDIA: Partial<Record<string, SystemMedia>> = {
  cardiovascular: {
    image: "/images/heart-circulatory.png",
    video: "/images/heart-circulatory.mp4",
    position: "50% 42%",
    tone: "light",
  },
  kidney: {
    image: "/images/kidney-urinary.png",
    video: "/images/kidney-urinary.mp4",
    position: "50% 50%",
    tone: "dark",
  },
  metabolic: {
    image: "/images/liver-metabolism.png",
    position: "50% 45%",
    tone: "light",
  },
  sleep: {
    image: "/images/sleep-recovery.png",
    video: "/images/sleep-recovery.mp4",
    position: "50% 45%",
    tone: "light",
  },
  "body-composition": {
    image: "/images/body-composition.png",
    position: "50% 38%",
    tone: "light",
  },
};

function TrendIcon({ trend }: { trend: string | null }) {
  if (trend === "rising") return <TrendingUp className="size-4 text-red-500" />;
  if (trend === "falling") return <TrendingDown className="size-4 text-emerald-600" />;
  if (trend === "flat") return <Minus className="size-4 text-muted-foreground" />;
  return null;
}

function focusTone(tone: DashboardFocus["tone"]) {
  if (tone === "danger") return "border-destructive/30 bg-destructive/5";
  if (tone === "warning") return "border-[var(--warning)]/45 bg-[var(--warning)]/10";
  if (tone === "success") return "border-[var(--success)]/35 bg-[var(--success)]/8";
  return "bg-card/95";
}

function reasonTone(reason: string | null) {
  if (reason === "critical" || reason === "high" || reason === "low") {
    return "bg-destructive/10 text-destructive";
  }
  if (reason === "rising") return "bg-[var(--warning)]/20 text-[color-mix(in_oklch,var(--warning),black_45%)]";
  if (reason === "falling") return "bg-[var(--success)]/15 text-[color-mix(in_oklch,var(--success),black_32%)]";
  return "bg-secondary text-secondary-foreground";
}

function systemTone(tone: DashboardSystemWidget["tone"]) {
  if (tone === "danger") return "border-destructive/35 bg-destructive/5";
  if (tone === "warning") return "border-[var(--warning)]/45 bg-[var(--warning)]/10";
  if (tone === "success") return "border-[var(--success)]/35 bg-[var(--success)]/8";
  return "bg-card/95";
}

function metricStatusTone(status: DashboardSystemWidget["metrics"][number]["status"]) {
  if (status === "attention") return "border-destructive/25 bg-destructive/8";
  if (status === "watch") return "border-[var(--warning)]/35 bg-[var(--warning)]/10";
  if (status === "normal") return "border-[var(--success)]/25 bg-[var(--success)]/8";
  return "border-border bg-muted/35";
}

function SystemIcon({ id }: { id: string }) {
  if (id === "cardiovascular") return <HeartPulse className="size-5 text-primary" />;
  if (id === "blood-counts") return <Droplets className="size-5 text-destructive" />;
  if (id === "kidney") return <Droplets className="size-5 text-destructive" />;
  if (id === "sleep") return <Bed className="size-5 text-primary" />;
  if (id === "body-composition") {
    return <Dumbbell className="size-5 text-[color-mix(in_oklch,var(--success),black_22%)]" />;
  }
  if (id === "metabolic") {
    return <Activity className="size-5 text-[color-mix(in_oklch,var(--warning),black_22%)]" />;
  }
  if (id === "eyes") return <Eye className="size-5 text-primary" />;
  if (id === "dental") {
    return <Smile className="size-5 text-[color-mix(in_oklch,var(--success),black_22%)]" />;
  }
  return <Stethoscope className="size-5 text-primary" />;
}

function MiniCallout({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-white/45 bg-white/70 px-2.5 py-2 text-foreground shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/10">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function WidgetMiniChart({ widget }: { widget: DashboardSystemWidget }) {
  const points = widget.visual.points.map((value, index) => ({ index, value }));

  if (points.length < 2) {
    return (
      <div className="grid h-20 place-items-center rounded-md border border-dashed border-white/50 bg-white/30 px-3 text-center text-xs font-medium text-muted-foreground backdrop-blur-md dark:border-white/10 dark:bg-white/5">
        Not enough history for a trend chart
      </div>
    );
  }

  return (
    <div className="h-20">
      <RechartsResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={points} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <RechartsYAxis hide domain={["auto", "auto"]} />
          <RechartsLine
            type="monotone"
            dataKey="value"
            stroke="var(--primary)"
            strokeWidth={2.5}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        </RechartsLineChart>
      </RechartsResponsiveContainer>
    </div>
  );
}

function SystemSignalBadge({ widget }: { widget: DashboardSystemWidget }) {
  const tone =
    widget.tone === "danger"
      ? "bg-red-500 text-white"
      : widget.tone === "warning"
        ? "bg-amber-400 text-amber-950"
        : widget.tone === "success"
          ? "bg-emerald-400 text-emerald-950"
          : "bg-white/80 text-foreground";

  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm", tone)}>
      {widget.tone === "danger"
        ? "Review"
        : widget.tone === "warning"
          ? "Watch"
          : widget.tone === "success"
            ? "Tracked"
            : "Building"}
    </span>
  );
}

function SystemGraphic({ widget }: { widget: DashboardSystemWidget }) {
  const media = SYSTEM_MEDIA[widget.id];

  if (media) {
    const lightMedia = media.tone === "light";
    const topMetric = widget.metrics.find((metric) => metric.value !== "No data") ?? widget.metrics[0];

    return (
      <div
        className={cn(
          "relative min-h-72 overflow-hidden rounded-lg border shadow-inner",
          lightMedia ? "border-black/10 bg-slate-100" : "border-white/10 bg-slate-950"
        )}
      >
        {media.video ? (
          <video
            aria-hidden="true"
            autoPlay
            className="absolute inset-0 size-full object-cover"
            loop
            muted
            playsInline
            poster={media.image}
            style={{ objectPosition: media.position }}
          >
            <source src={media.video} type="video/mp4" />
          </video>
        ) : (
          <Image
            alt=""
            aria-hidden="true"
            className="absolute inset-0 size-full object-cover"
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            src={media.image}
            style={{ objectPosition: media.position }}
            unoptimized
          />
        )}
        <div
          className={cn(
            "absolute inset-0",
            lightMedia
              ? "bg-[linear-gradient(90deg,rgba(248,250,252,.94),rgba(248,250,252,.62)_42%,rgba(248,250,252,.08)),linear-gradient(0deg,rgba(15,23,42,.24),rgba(15,23,42,0)_48%)]"
              : "bg-[linear-gradient(90deg,rgba(2,6,23,.82),rgba(2,6,23,.5)_42%,rgba(2,6,23,.18)),linear-gradient(0deg,rgba(2,6,23,.72),rgba(2,6,23,0)_55%)]"
          )}
        />
        <div className="absolute inset-0 grid content-between p-3 sm:p-4">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div
              className={cn(
                "grid max-w-[72%] gap-0.5 rounded-md border px-3 py-2 shadow-sm backdrop-blur-md",
                lightMedia
                  ? "border-white/70 bg-white/72 text-foreground"
                  : "border-white/10 bg-white/10 text-white"
              )}
            >
              <span className={cn("text-[11px] font-medium", lightMedia ? "text-muted-foreground" : "text-white/70")}>
                {widget.visual.label}
              </span>
              <span className="truncate text-xl font-semibold tabular-nums">{widget.visual.value}</span>
            </div>
            <SystemSignalBadge widget={widget} />
          </div>
          <div className="grid gap-2 sm:max-w-[58%]">
            <div
              className={cn(
                "rounded-md border p-2.5 shadow-sm backdrop-blur-md",
                lightMedia
                  ? "border-white/70 bg-white/76 text-foreground"
                  : "border-white/10 bg-slate-950/44 text-white"
              )}
            >
              <div className={cn(lightMedia ? "" : "[&_.recharts-line-curve]:stroke-white")}>
                <WidgetMiniChart widget={widget} />
              </div>
            </div>
            {topMetric && (
              <div
                className={cn(
                  "min-w-0 rounded-md border px-3 py-2 shadow-sm backdrop-blur-md",
                  lightMedia
                    ? "border-white/70 bg-white/78 text-foreground"
                    : "border-white/10 bg-white/10 text-white"
                )}
              >
                <p className={cn("truncate text-[11px]", lightMedia ? "text-muted-foreground" : "text-white/70")}>
                  {topMetric.label}
                </p>
                <p className="truncate text-sm font-semibold tabular-nums">{topMetric.value}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-36 overflow-hidden rounded-lg border border-white/50 bg-[linear-gradient(135deg,oklch(0.96_0.025_226),oklch(0.99_0.018_185))] p-4 dark:border-white/10 dark:bg-[linear-gradient(135deg,oklch(0.24_0.045_240),oklch(0.18_0.038_252))]">
      <div className="grid h-full grid-cols-[5rem_1fr] gap-4">
        <div className="grid place-items-center">
          <div className="grid size-20 place-items-center rounded-full border border-white/60 bg-white/55 shadow-inner backdrop-blur-md dark:border-white/10 dark:bg-white/10">
            <SystemIcon id={widget.id} />
          </div>
        </div>
        <div className="grid content-center gap-2">
          <p className="text-[11px] font-medium text-muted-foreground">
            {widget.visual.label}: {widget.visual.value}
          </p>
          <WidgetMiniChart widget={widget} />
          {widget.metrics.slice(0, 2).map((metric) => (
            <MiniCallout key={`${widget.id}-callout-${metric.label}`} label={metric.label} value={metric.value} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SystemWidgetCard({ widget }: { widget: DashboardSystemWidget }) {
  const firstSection = widget.relatedSectionIds[0];

  return (
    <Card className={cn("interactive-card min-w-0 overflow-hidden py-0", systemTone(widget.tone))}>
      <div className="p-3 pb-0">
        <SystemGraphic widget={widget} />
      </div>
      <CardHeader className="px-4 pb-0">
        <CardTitle className="grid gap-3">
          <span className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background/70">
                <SystemIcon id={widget.id} />
              </span>
              <span className="grid min-w-0 gap-0.5">
                <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                  {widget.eyebrow}
                </span>
                <span className="truncate text-base font-semibold">{widget.title}</span>
              </span>
            </span>
            {widget.reportCount > 0 && (
              <Badge variant="secondary">{widget.reportCount} reports</Badge>
            )}
          </span>
          <span className="text-sm font-medium leading-5">{widget.summary}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 px-4">
        <p className="text-sm leading-5 text-muted-foreground">{widget.detail}</p>
        <div className="grid grid-cols-2 gap-2">
          {widget.metrics.map((metric) => (
            <div
              key={`${widget.id}-${metric.label}`}
              className={cn("min-w-0 rounded-md border p-2.5", metricStatusTone(metric.status))}
            >
              <p className="truncate text-xs text-muted-foreground">{metric.label}</p>
              <p className="mt-1 truncate text-sm font-semibold tabular-nums">{metric.value}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{metric.detail}</p>
            </div>
          ))}
        </div>
        {firstSection ? (
          <Link
            href={`#${firstSection}`}
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            Drill into measurements
          </Link>
        ) : (
          <Link
            href="/documents"
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            Review source reports
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function MetricChart({ card }: { card: MetricCard }) {
  const data = card.points.map((p) => ({
    ...p,
    t: new Date(p.date).getTime(),
    label: new Date(p.date).toLocaleDateString("en-IN", {
      month: "short",
      year: "2-digit",
    }),
  }));
  const refHigh = card.points.find((p) => p.referenceHigh != null)?.referenceHigh;
  const refLow = card.points.find((p) => p.referenceLow != null)?.referenceLow;

  return (
    <RechartsResponsiveContainer width="100%" height={90}>
      <RechartsLineChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
        <RechartsXAxis dataKey="label" hide />
        <RechartsYAxis hide domain={["auto", "auto"]} />
        <RechartsTooltip
          formatter={(value) => [`${value} ${card.unit ?? ""}`, card.name]}
          labelFormatter={(_, payload) =>
            payload?.[0]
              ? new Date(payload[0].payload.date).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : ""
          }
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            borderColor: "var(--border)",
            boxShadow: "0 12px 30px oklch(0.19 0.035 252 / 12%)",
          }}
        />
        {refHigh != null && (
          <RechartsReferenceLine y={refHigh} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity={0.5} />
        )}
        {refLow != null && (
          <RechartsReferenceLine y={refLow} stroke="#3b82f6" strokeDasharray="4 3" strokeOpacity={0.4} />
        )}
        <RechartsLine
          type="monotone"
          dataKey="value"
          stroke="var(--chart-1)"
          strokeWidth={2.5}
          dot={{ r: 3, strokeWidth: 2, fill: "var(--card)" }}
          activeDot={{ r: 5 }}
          isAnimationActive={card.points.length <= 40}
        />
      </RechartsLineChart>
    </RechartsResponsiveContainer>
  );
}

function MetricCardView({ card }: { card: MetricCard }) {
  const latest = card.latest!;
  const abnormal =
    latest.interpretation === "high" ||
    latest.interpretation === "critical" ||
    latest.interpretation === "low";

  return (
    <Card
      className={cn("interactive-card py-4", abnormal && "ring-destructive/25")}
    >
      <CardHeader className="px-4 pb-0">
        <CardTitle className="grid gap-1 text-sm">
          <span className="flex min-w-0 items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{card.name}</span>
              <TrendIcon trend={card.trend} />
            </span>
            <span
              className={cn(
                "shrink-0 text-base font-semibold tabular-nums",
                abnormal && "text-destructive"
              )}
            >
              {latest.value}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {card.unit}
              </span>
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-1.5 text-xs font-normal text-muted-foreground">
            {card.categoryLabel}
            <span>·</span>
            {new Date(latest.date).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            {latest.referenceHigh != null &&
              ` · ref ${latest.referenceLow ?? 0}-${latest.referenceHigh}`}
            {card.reason && (
              <Badge className={reasonTone(card.reason)} variant="secondary">
                {card.reason}
              </Badge>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-0">
        <MetricChart card={card} />
      </CardContent>
    </Card>
  );
}

function EventIcon({ marker }: { marker: DashboardMarker }) {
  return marker.kind === "prescription" || marker.kind === "medication" ? (
    <Pill className="size-4 text-muted-foreground" />
  ) : (
    <Stethoscope className="size-4 text-muted-foreground" />
  );
}

export function DashboardView({
  profileName,
  data,
}: {
  profileName: string;
  data: AdaptiveDashboardData;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  void searchParams;

  const hasMetabolicSignals =
    data.derived.astAltRatio != null ||
    data.derived.tgHdlRatio != null ||
    data.derived.altTrend != null ||
    data.derived.hba1cTrend != null;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge className="mb-2 bg-accent text-accent-foreground" variant="secondary">
            Dashboard
          </Badge>
          <h1 className="text-3xl font-semibold">Health overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Adapts to confirmed data for {profileName}
          </p>
        </div>
        <div className="scrollbar-none flex max-w-full overflow-x-auto rounded-lg border bg-card/80 p-1 shadow-xs">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={`${pathname}?range=${r.key}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-all",
                data.range === r.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {data.focus.map((item) => (
          <Card key={item.label} className={cn("py-3", focusTone(item.tone))}>
            <CardContent className="px-4">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{item.value}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{item.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.sections.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              mood="thinking"
              title="No confirmed values in this range"
              description="Upload and confirm a report and Hearth will build the dashboard from what is actually present."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {data.systemWidgets.length > 0 && (
            <section className="grid gap-3">
              <div>
                <h2 className="text-lg font-semibold">Body systems</h2>
                <p className="text-sm text-muted-foreground">
                  Plain-language widgets combine related numbers before the detailed charts.
                </p>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {data.systemWidgets.map((widget) => (
                  <SystemWidgetCard key={widget.id} widget={widget} />
                ))}
              </div>
            </section>
          )}

          <section className="grid gap-3">
            <div>
              <h2 className="text-lg font-semibold">Detailed measurements</h2>
              <p className="text-sm text-muted-foreground">
                Drill-down charts remain available for every confirmed value in this range.
              </p>
            </div>
          </section>

          {data.sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24 grid gap-3">
              <div>
                <h2 className="text-lg font-semibold">{section.title}</h2>
                <p className="text-sm text-muted-foreground">{section.description}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {section.cards.map((card) => (
                  <MetricCardView key={`${section.id}-${card.name}`} card={card} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {hasMetabolicSignals && (
        <section className="grid gap-3">
          <div>
            <h2 className="text-lg font-semibold">Computed signals</h2>
            <p className="text-sm text-muted-foreground">
              Shown only when the needed source values exist.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="py-3">
              <CardContent className="px-4">
                <p className="text-xs text-muted-foreground">AST/ALT ratio</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {data.derived.astAltRatio ?? "–"}
                </p>
                <p className="text-xs text-muted-foreground">Liver context</p>
              </CardContent>
            </Card>
            <Card className="py-3">
              <CardContent className="px-4">
                <p className="text-xs text-muted-foreground">TG/HDL ratio</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {data.derived.tgHdlRatio ?? "–"}
                </p>
                <p className="text-xs text-muted-foreground">Metabolic context</p>
              </CardContent>
            </Card>
            <Card className="py-3">
              <CardContent className="px-4">
                <p className="text-xs text-muted-foreground">ALT trend</p>
                <p className="flex items-center gap-1 text-2xl font-semibold capitalize">
                  <TrendIcon trend={data.derived.altTrend} />
                  {data.derived.altTrend ?? "–"}
                </p>
              </CardContent>
            </Card>
            <Card className="py-3">
              <CardContent className="px-4">
                <p className="text-xs text-muted-foreground">HbA1c trend</p>
                <p className="flex items-center gap-1 text-2xl font-semibold capitalize">
                  <TrendIcon trend={data.derived.hba1cTrend} />
                  {data.derived.hba1cTrend ?? "–"}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {data.reportGroups.length > 0 && (
        <section className="grid gap-3">
          <div>
            <h2 className="text-lg font-semibold">Care areas</h2>
            <p className="text-sm text-muted-foreground">
              Specialty areas appear only when reports exist for this profile.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.reportGroups.map((group) => (
              <Card key={group.key} className="py-4">
                <CardHeader className="px-4 pb-0">
                  <CardTitle className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <ClipboardList className="size-4 text-primary" />
                      <span className="truncate">{group.label}</span>
                    </span>
                    <Badge variant="secondary">{group.count}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 px-4">
                  {group.latestDate && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="size-3.5" />
                      {new Date(group.latestDate).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  )}
                  {group.followUpCount > 0 && (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                      <AlertTriangle className="size-3.5" />
                      {group.followUpCount} follow-up flagged
                    </p>
                  )}
                  {group.latestSummary && (
                    <p className="line-clamp-3 text-sm text-muted-foreground">
                      {group.latestSummary}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {data.markers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Events in range</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5">
            {data.markers.slice(-12).map((m, i) => (
              <div key={`${m.date}-${i}`} className="flex items-center gap-2 text-sm">
                <EventIcon marker={m} />
                <span className="tabular-nums text-muted-foreground">
                  {new Date(m.date).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                {m.label}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
