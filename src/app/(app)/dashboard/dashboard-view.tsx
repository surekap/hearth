"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingDown, TrendingUp, Minus, Pill, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardMarker, MetricCard } from "@/lib/dashboard";

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
    <ResponsiveContainer width="100%" height={90}>
      <LineChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
        <XAxis dataKey="label" hide />
        <YAxis hide domain={["auto", "auto"]} />
        <Tooltip
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
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        {refHigh != null && (
          <ReferenceLine y={refHigh} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity={0.5} />
        )}
        {refLow != null && (
          <ReferenceLine y={refLow} stroke="#3b82f6" strokeDasharray="4 3" strokeOpacity={0.4} />
        )}
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--primary)"
          strokeWidth={2}
          dot={{ r: 3 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DashboardView({
  profileName,
  data,
}: {
  profileName: string;
  data: {
    range: string;
    cards: MetricCard[];
    derived: {
      astAltRatio: number | null;
      tgHdlRatio: number | null;
      altTrend: string | null;
      hba1cTrend: string | null;
      abnormalCount: number;
      totalCount: number;
    };
    markers: DashboardMarker[];
  };
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  void searchParams;

  const withData = data.cards.filter((c) => c.points.length > 0);
  const empty = data.cards.filter((c) => c.points.length === 0);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Metabolic &amp; liver</h1>
          <p className="text-sm text-muted-foreground">
            Confirmed values only · {profileName}
          </p>
        </div>
        <div className="flex rounded-lg border p-0.5">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={`${pathname}?range=${r.key}`}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
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

      {/* Derived signals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="py-3">
          <CardContent className="px-4">
            <p className="text-xs text-muted-foreground">AST/ALT ratio</p>
            <p className="text-lg font-semibold tabular-nums">
              {data.derived.astAltRatio ?? "–"}
            </p>
            <p className="text-xs text-muted-foreground">&lt;1 typical in NAFLD</p>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="px-4">
            <p className="text-xs text-muted-foreground">TG/HDL ratio</p>
            <p className="text-lg font-semibold tabular-nums">
              {data.derived.tgHdlRatio ?? "–"}
            </p>
            <p className="text-xs text-muted-foreground">&gt;3 suggests insulin resistance</p>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="px-4">
            <p className="text-xs text-muted-foreground">ALT trend</p>
            <p className="flex items-center gap-1 text-lg font-semibold capitalize">
              <TrendIcon trend={data.derived.altTrend} />
              {data.derived.altTrend ?? "–"}
            </p>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="px-4">
            <p className="text-xs text-muted-foreground">Abnormal values</p>
            <p className="text-lg font-semibold tabular-nums">
              {data.derived.abnormalCount}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                / {data.derived.totalCount}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">in selected range</p>
          </CardContent>
        </Card>
      </div>

      {/* Metric cards */}
      {withData.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            No confirmed values in this range yet. Upload and confirm a lab report to see
            trends.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {withData.map((card) => {
            const latest = card.latest!;
            const abnormal =
              latest.interpretation === "high" ||
              latest.interpretation === "critical" ||
              latest.interpretation === "low";
            return (
              <Card key={card.name} className={cn("py-4", abnormal && "border-red-200")}>
                <CardHeader className="px-4 pb-0">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5">
                      {card.name}
                      <TrendIcon trend={card.trend} />
                    </span>
                    <span
                      className={cn(
                        "text-base font-semibold tabular-nums",
                        abnormal && "text-red-600"
                      )}
                    >
                      {latest.value}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {card.unit}
                      </span>
                    </span>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {new Date(latest.date).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {latest.referenceHigh != null &&
                      ` · ref ${latest.referenceLow ?? 0}–${latest.referenceHigh}`}
                    {abnormal && (
                      <Badge className="ml-2 bg-red-100 text-red-800" variant="secondary">
                        {latest.interpretation}
                      </Badge>
                    )}
                  </p>
                </CardHeader>
                <CardContent className="px-2 pb-0">
                  <MetricChart card={card} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Event markers */}
      {data.markers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Events in range</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5">
            {data.markers.map((m, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {m.kind === "prescription" ? (
                  <Pill className="size-4 text-muted-foreground" />
                ) : (
                  <Stethoscope className="size-4 text-muted-foreground" />
                )}
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

      {empty.length > 0 && (
        <p className="text-xs text-muted-foreground">
          No data yet for: {empty.map((c) => c.name).join(", ")}
        </p>
      )}
    </div>
  );
}
