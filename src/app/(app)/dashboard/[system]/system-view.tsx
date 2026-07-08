"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ArrowLeft, ChevronRight, ClipboardList, Dna } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricChart } from "@/components/health/metric-chart";
import { Sparkline } from "@/components/health/sparkline";
import { formatMetricNumber, RANGES, RANGE_LABELS } from "@/lib/health/series";
import type { SystemPageData } from "@/lib/health/system";
import { cn } from "@/lib/utils";

function interpBadge(interpretation: string) {
  if (interpretation === "high" || interpretation === "critical") {
    return <Badge className="bg-destructive/10 text-destructive">{interpretation}</Badge>;
  }
  if (interpretation === "low") return <Badge className="bg-primary/10 text-primary">low</Badge>;
  return null;
}

export function SystemView({ data }: { data: SystemPageData }) {
  const pathname = usePathname();
  const { def, hero } = data;
  const media = def.media;
  const light = media?.tone !== "dark";

  return (
    <div className="grid gap-5">
      <div
        className={cn(
          "relative min-h-64 overflow-hidden rounded-xl border shadow-inner",
          media
            ? light
              ? "bg-slate-100"
              : "bg-slate-950"
            : "bg-[linear-gradient(135deg,oklch(0.96_0.025_226),oklch(0.99_0.018_185))] dark:bg-[linear-gradient(135deg,oklch(0.24_0.045_240),oklch(0.18_0.038_252))]"
        )}
      >
        {media?.video ? (
          <video
            aria-hidden="true"
            autoPlay
            loop
            muted
            playsInline
            poster={media.image}
            className="absolute inset-0 size-full object-cover motion-reduce:hidden"
            style={{ objectPosition: media.position }}
          >
            <source src={media.video} type="video/mp4" />
          </video>
        ) : media ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.image}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 size-full object-cover"
            style={{ objectPosition: media.position }}
          />
        ) : null}
        {media?.video && (
          // Reduced-motion users get the poster image instead of the video.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.image}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 hidden size-full object-cover motion-reduce:block"
            style={{ objectPosition: media.position }}
          />
        )}
        {media && (
          <div
            className={cn(
              "absolute inset-0",
              light
                ? "bg-[linear-gradient(90deg,rgba(248,250,252,.92),rgba(248,250,252,.55)_45%,rgba(248,250,252,.06))]"
                : "bg-[linear-gradient(90deg,rgba(2,6,23,.85),rgba(2,6,23,.5)_45%,rgba(2,6,23,.15))]"
            )}
          />
        )}
        <div className={cn("relative grid content-between gap-6 p-5 sm:p-6", !light && media && "text-white")}>
          <div>
            <Link
              href="/dashboard"
              className={cn(
                "mb-2 inline-flex items-center gap-1 text-sm font-medium",
                light || !media
                  ? "text-muted-foreground hover:text-foreground"
                  : "text-white/70 hover:text-white"
              )}
            >
              <ArrowLeft className="size-4" /> Overview
            </Link>
            <Badge className="mb-2 block w-fit bg-accent text-accent-foreground" variant="secondary">
              {def.eyebrow}
            </Badge>
            <h1 className="text-3xl font-semibold">{def.title}</h1>
            <p
              className={cn(
                "mt-1 max-w-xl text-sm",
                light || !media ? "text-muted-foreground" : "text-white/75"
              )}
            >
              {def.description}
            </p>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            {hero && (
              <Link
                href={`/metrics/${hero.typeId}`}
                className={cn(
                  "grid gap-0.5 rounded-lg border px-4 py-2.5 shadow-sm backdrop-blur-md transition-colors",
                  light || !media
                    ? "border-white/70 bg-white/75 hover:bg-white/90"
                    : "border-white/10 bg-white/10 hover:bg-white/20"
                )}
              >
                <span
                  className={cn(
                    "text-[11px] font-medium",
                    light || !media ? "text-muted-foreground" : "text-white/70"
                  )}
                >
                  {hero.name}
                </span>
                <span className="text-2xl font-semibold tabular-nums">{hero.value}</span>
              </Link>
            )}
            <div className="scrollbar-none flex max-w-full overflow-x-auto rounded-lg border bg-card/85 p-1 shadow-xs backdrop-blur-md">
              {RANGES.map((r) => (
                <Link
                  key={r}
                  href={`${pathname}?range=${r}`}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition-all",
                    data.range === r
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {RANGE_LABELS[r]}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {data.keyCharts.filter((c) => c.series.points.length >= 2).length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Key trends</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {data.keyCharts
              .filter((c) => c.series.points.length >= 2)
              .map((chart) => (
                <Card key={chart.typeId} className="interactive-card py-4">
                  <CardHeader className="px-4 pb-0">
                    <CardTitle className="flex items-center justify-between gap-2 text-sm">
                      <Link
                        href={`/metrics/${chart.typeId}?range=${data.range}`}
                        className="truncate hover:underline"
                      >
                        {chart.name}
                      </Link>
                      <span className="shrink-0 text-xs font-normal text-muted-foreground">
                        {chart.series.caption}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 pb-0">
                    <MetricChart series={chart.series} unit={chart.unit} markers={data.markers} height={200} />
                  </CardContent>
                </Card>
              ))}
          </div>
        </section>
      )}

      <section className="grid gap-3">
        <div>
          <h2 className="text-lg font-semibold">All measurements in this system</h2>
          <p className="text-sm text-muted-foreground">
            Every confirmed value — nothing hidden. Open any row for full history.
          </p>
        </div>
        <Card className="py-1">
          <CardContent className="divide-y px-0">
            {data.metrics.map((row) => (
              <Link
                key={row.typeId}
                href={`/metrics/${row.typeId}?range=${data.range}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{row.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {new Date(row.latestDate).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {" · "}
                    {row.pointCount.toLocaleString("en-IN")} value{row.pointCount === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <Sparkline values={row.spark} className="hidden h-5 w-16 text-primary sm:block" />
                  {interpBadge(row.interpretation)}
                  <span className="text-sm font-semibold tabular-nums">
                    {row.latestValue != null
                      ? formatMetricNumber(row.latestValue, row.unit)
                      : row.latestText}
                    {row.unit && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">{row.unit}</span>
                    )}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>

      {(data.reports.length > 0 || data.genetics.length > 0) && (
        <section className="grid gap-3 lg:grid-cols-2">
          {data.reports.length > 0 && (
            <Card className="py-4">
              <CardHeader className="px-4 pb-0">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <ClipboardList className="size-4 text-primary" /> Related reports
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 px-4">
                {data.reports.map((r) => (
                  <Link
                    key={r.id}
                    href={`/documents/${r.documentId}/review`}
                    className="rounded-md border p-2.5 transition-colors hover:bg-muted/40"
                  >
                    <p className="flex items-center justify-between text-sm font-medium">
                      {r.specialty ?? r.reportType}
                      {r.followUpRecommended && (
                        <span className="inline-flex items-center gap-1 text-xs text-destructive">
                          <AlertTriangle className="size-3.5" /> follow-up
                        </span>
                      )}
                    </p>
                    {r.reportDate && (
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.reportDate).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    )}
                    {r.summary && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.summary}</p>
                    )}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
          {data.genetics.length > 0 && (
            <Card className="py-4">
              <CardHeader className="px-4 pb-0">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <Dna className="size-4 text-primary" /> Genetic context
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 px-4">
                {data.genetics.map((g) => (
                  <Link
                    key={g.id}
                    href="/genetics"
                    className="rounded-md border p-2.5 transition-colors hover:bg-muted/40"
                  >
                    <p className="flex items-center justify-between gap-2 text-sm font-medium">
                      <span className="truncate">{g.conditionName}</span>
                      <Badge
                        className={cn(
                          g.riskLevel === "high"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-[var(--warning)]/20 text-[color-mix(in_oklch,var(--warning),black_45%)]"
                        )}
                        variant="secondary"
                      >
                        {g.riskLevel}
                      </Badge>
                    </p>
                    {g.summary && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{g.summary}</p>
                    )}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
