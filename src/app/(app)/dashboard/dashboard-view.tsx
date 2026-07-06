"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Bed,
  CalendarDays,
  CircleGauge,
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

function metricByLabel(widget: DashboardSystemWidget, label: string) {
  return widget.metrics.find((metric) => metric.label === label);
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

function PulseGraphic({ widget }: { widget: DashboardSystemWidget }) {
  const ldl = metricByLabel(widget, "LDL");
  const hba1c = metricByLabel(widget, "HbA1c");

  return (
    <div className="relative min-h-36 overflow-hidden rounded-lg border border-white/50 bg-[linear-gradient(135deg,oklch(0.95_0.04_205),oklch(0.99_0.018_27))] p-4 dark:border-white/10 dark:bg-[linear-gradient(135deg,oklch(0.28_0.055_225),oklch(0.2_0.045_252))]">
      <div className="absolute inset-x-4 top-1/2 h-px bg-white/70 dark:bg-white/15" />
      <div className="absolute left-4 right-4 top-10 flex h-16 items-end gap-1">
        {[24, 42, 30, 68, 34, 28, 76, 46, 36, 58, 82, 44, 32, 66, 38, 54].map((height, index) => (
          <span
            key={index}
            className="flex-1 rounded-full bg-primary/45 shadow-sm"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <div className="absolute bottom-3 left-3 right-3 grid grid-cols-2 gap-2">
        <MiniCallout label="LDL" value={ldl?.value ?? "No data"} />
        <MiniCallout label="HbA1c" value={hba1c?.value ?? "No data"} />
      </div>
    </div>
  );
}

function SleepGraphic({ widget }: { widget: DashboardSystemWidget }) {
  const asleep = metricByLabel(widget, "Asleep");
  const deep = metricByLabel(widget, "Deep");
  const rem = metricByLabel(widget, "REM");

  return (
    <div className="relative min-h-36 overflow-hidden rounded-lg border border-white/50 bg-[linear-gradient(135deg,oklch(0.28_0.07_260),oklch(0.48_0.09_235))] p-4 text-white shadow-inner dark:border-white/10">
      <div className="absolute right-5 top-4 size-10 rounded-full bg-white/90 shadow-[0_0_24px_oklch(0.9_0.05_95/45%)]" />
      <div className="relative grid gap-1">
        <p className="text-xs uppercase text-white/70">Last sleep</p>
        <p className="text-3xl font-semibold tabular-nums">{asleep?.value ?? "No data"}</p>
      </div>
      <div className="absolute bottom-4 left-4 right-4 grid grid-cols-7 items-end gap-1.5">
        {[42, 60, 35, 75, 54, 88, 64].map((height, index) => (
          <span
            key={index}
            className="rounded-full bg-white/45"
            style={{ height: `${height}px` }}
          />
        ))}
      </div>
      <div className="absolute bottom-4 left-4 right-4 flex justify-between text-[11px] text-white/80">
        <span>{deep?.value ?? "Deep"}</span>
        <span>{rem?.value ?? "REM"}</span>
      </div>
    </div>
  );
}

function BodyCompositionGraphic({ widget }: { widget: DashboardSystemWidget }) {
  const bmi = metricByLabel(widget, "BMI");
  const bmr = metricByLabel(widget, "BMR");
  const fat = metricByLabel(widget, "Body fat");
  const lean = metricByLabel(widget, "Lean mass");

  return (
    <div className="relative min-h-36 overflow-hidden rounded-lg border border-white/50 bg-[linear-gradient(135deg,oklch(0.95_0.045_150),oklch(0.99_0.025_82))] p-4 dark:border-white/10 dark:bg-[linear-gradient(135deg,oklch(0.23_0.045_155),oklch(0.2_0.04_95))]">
      <div className="grid grid-cols-[7rem_1fr] gap-4">
        <div
          className="grid aspect-square place-items-center rounded-full border border-white/65 shadow-inner"
          style={{
            background:
              "conic-gradient(var(--success) 0 58%, oklch(0.89 0.03 145) 58% 72%, oklch(0.82 0.08 80) 72% 100%)",
          }}
        >
          <div className="grid size-20 place-items-center rounded-full bg-card/90 text-center shadow-sm">
            <CircleGauge className="mx-auto size-5 text-primary" />
            <span className="text-xs font-semibold">Body</span>
          </div>
        </div>
        <div className="grid content-center gap-2">
          <MiniCallout label="BMI" value={bmi?.value ?? "No data"} />
          <MiniCallout label="BMR" value={bmr?.value ?? "No data"} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniCallout label="Fat" value={fat?.value ?? "No data"} />
        <MiniCallout label="Lean mass" value={lean?.value ?? "No data"} />
      </div>
    </div>
  );
}

function SystemGraphic({ widget }: { widget: DashboardSystemWidget }) {
  if (widget.id === "cardiovascular") return <PulseGraphic widget={widget} />;
  if (widget.id === "sleep") return <SleepGraphic widget={widget} />;
  if (widget.id === "body-composition") return <BodyCompositionGraphic widget={widget} />;

  return (
    <div className="relative min-h-36 overflow-hidden rounded-lg border border-white/50 bg-[linear-gradient(135deg,oklch(0.96_0.025_226),oklch(0.99_0.018_185))] p-4 dark:border-white/10 dark:bg-[linear-gradient(135deg,oklch(0.24_0.045_240),oklch(0.18_0.038_252))]">
      <div className="grid h-full grid-cols-[5rem_1fr] gap-4">
        <div className="grid place-items-center">
          <div className="grid size-20 place-items-center rounded-full border border-white/60 bg-white/55 shadow-inner backdrop-blur-md dark:border-white/10 dark:bg-white/10">
            <SystemIcon id={widget.id} />
          </div>
        </div>
        <div className="grid content-center gap-2">
          {widget.metrics.slice(0, 2).map((metric) => (
            <MiniCallout key={`${widget.id}-callout-${metric.label}`} label={metric.label} value={metric.value} />
          ))}
        </div>
      </div>
      <div className="absolute bottom-3 left-4 right-4 flex items-end gap-1">
        {[36, 62, 44, 72, 52, 68, 40, 58, 76, 48, 66, 54].map((height, index) => (
          <span
            key={index}
            className="h-10 flex-1 rounded-full bg-primary/20"
            style={{ height: `${height / 2}px` }}
          />
        ))}
      </div>
    </div>
  );
}

function SystemWidgetCard({ widget }: { widget: DashboardSystemWidget }) {
  const firstSection = widget.relatedSectionIds[0];

  return (
    <Card className={cn("interactive-card overflow-hidden py-0", systemTone(widget.tone))}>
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
