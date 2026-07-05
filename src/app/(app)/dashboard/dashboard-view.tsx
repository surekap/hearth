"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  Minus,
  Pill,
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
        data.sections.map((section) => (
          <section key={section.id} className="grid gap-3">
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
        ))
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
