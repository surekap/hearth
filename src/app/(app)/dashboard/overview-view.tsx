"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  ClipboardList,
  Pill,
  Ruler,
  Stethoscope,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/mascot";
import type { OverviewData } from "@/lib/health/overview";
import { formatMetricNumber } from "@/lib/health/series";
import { cn } from "@/lib/utils";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function toneBadge(tone: "danger" | "success" | "neutral") {
  if (tone === "danger") {
    return (
      <span className="rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
        Review
      </span>
    );
  }
  if (tone === "success") {
    return (
      <span className="rounded-full bg-emerald-400 px-2.5 py-1 text-[11px] font-semibold text-emerald-950 shadow-sm">
        Tracked
      </span>
    );
  }
  return (
    <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-sm">
      Building
    </span>
  );
}

export function OverviewView({ profileName, data }: { profileName: string; data: OverviewData }) {
  const empty = data.systems.length === 0 && data.attention.length === 0;

  return (
    <div className="grid gap-5">
      <div>
        <Badge className="mb-2 bg-accent text-accent-foreground" variant="secondary">
          Dashboard
        </Badge>
        <h1 className="text-3xl font-semibold">Health overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {profileName} · {data.measurementCount.toLocaleString("en-IN")} tracked measurements
        </p>
      </div>

      {empty ? (
        <Card>
          <CardContent>
            <EmptyState
              mood="thinking"
              title="No confirmed values yet"
              description="Upload and confirm a report and Hearth will build this overview from what is actually present."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {data.attention.length > 0 && (
            <section className="grid gap-3">
              <div>
                <h2 className="text-lg font-semibold">Needs attention</h2>
                <p className="text-sm text-muted-foreground">
                  Recent confirmed values outside their reference range.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {data.attention.map((row) => (
                  <Link key={row.typeId} href={`/metrics/${row.typeId}`}>
                    <Card
                      className={cn(
                        "interactive-card h-full py-3",
                        row.interpretation === "critical"
                          ? "border-destructive/50 bg-destructive/8"
                          : "border-destructive/25 bg-destructive/4"
                      )}
                    >
                      <CardContent className="px-4">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                          <AlertTriangle className="size-3.5" /> {row.interpretation}
                        </p>
                        <p className="mt-1 truncate text-sm font-semibold">{row.name}</p>
                        <p className="text-xl font-semibold tabular-nums">
                          {row.latestValue != null
                            ? formatMetricNumber(row.latestValue, row.unit)
                            : row.latestText}
                          {row.unit && (
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              {row.unit}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{fmtDate(row.latestDate)}</p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
              {data.historicalCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {data.historicalCount} older abnormal value{data.historicalCount === 1 ? "" : "s"} not
                  shown — they appear on their measurement pages.
                </p>
              )}
            </section>
          )}

          <section className="grid gap-3">
            <div>
              <h2 className="text-lg font-semibold">Body systems</h2>
              <p className="text-sm text-muted-foreground">
                Open a system to see every related measurement.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.systems.map((system) => (
                <Link key={system.id} href={`/dashboard/${system.id}`} className="group">
                  <Card className="interactive-card h-full overflow-hidden py-0">
                    <div
                      className={cn(
                        "relative h-40 overflow-hidden",
                        system.media
                          ? system.media.tone === "dark"
                            ? "bg-slate-950"
                            : "bg-slate-100"
                          : "bg-[linear-gradient(135deg,oklch(0.96_0.025_226),oklch(0.99_0.018_185))] dark:bg-[linear-gradient(135deg,oklch(0.24_0.045_240),oklch(0.18_0.038_252))]"
                      )}
                    >
                      {system.media?.video ? (
                        <video
                          aria-hidden="true"
                          autoPlay
                          loop
                          muted
                          playsInline
                          poster={system.media.image}
                          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:hidden"
                          style={{ objectPosition: system.media.position }}
                        >
                          <source src={system.media.video} type="video/mp4" />
                        </video>
                      ) : system.media ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={system.media.image}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
                          style={{ objectPosition: system.media.position }}
                        />
                      ) : null}
                      {system.media?.video && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={system.media.image}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 hidden size-full object-cover motion-reduce:block"
                          style={{ objectPosition: system.media.position }}
                        />
                      )}
                      <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(2,6,23,.55),rgba(2,6,23,.05)_60%)]" />
                      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 text-white">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-white/70">
                            {system.eyebrow}
                          </p>
                          <p className="truncate text-base font-semibold">{system.title}</p>
                        </div>
                        {toneBadge(system.tone)}
                      </div>
                    </div>
                    <CardContent className="flex items-center justify-between px-4 py-3">
                      <span className="min-w-0 text-sm text-muted-foreground">
                        {system.hero ? (
                          <>
                            <span className="block text-xs">{system.hero.name}</span>
                            <span className="block truncate text-base font-semibold tabular-nums text-foreground">
                              {system.hero.value}
                            </span>
                          </>
                        ) : (
                          "Reports only"
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        {system.memberCount} metric{system.memberCount === 1 ? "" : "s"}
                        <ChevronRight className="size-4" />
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}

              <Link href="/metrics" className="group">
                <Card className="interactive-card grid h-full place-items-center border-dashed py-8">
                  <CardContent className="grid place-items-center gap-2 text-center">
                    <span className="grid size-12 place-items-center rounded-full border bg-muted/40">
                      <Ruler className="size-5 text-primary" />
                    </span>
                    <p className="text-sm font-semibold">All measurements</p>
                    <p className="text-xs text-muted-foreground">
                      Browse and search all {data.measurementCount.toLocaleString("en-IN")} tracked
                      values
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </section>

          {data.careAreas.length > 0 && (
            <section className="grid gap-3">
              <h2 className="text-lg font-semibold">Care reports</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {data.careAreas.map((area) => (
                  <Link key={area.key} href="/documents">
                    <Card className="interactive-card h-full py-3">
                      <CardContent className="px-4">
                        <p className="flex items-center gap-1.5 text-sm font-semibold">
                          <ClipboardList className="size-4 text-primary" /> {area.label}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {area.count} report{area.count === 1 ? "" : "s"}
                          {area.latestDate ? ` · latest ${fmtDate(area.latestDate)}` : ""}
                        </p>
                        {area.followUpCount > 0 && (
                          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-destructive">
                            <AlertTriangle className="size-3.5" /> {area.followUpCount} follow-up
                            flagged
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.recentMarkers.length > 0 && (
            <section className="grid gap-3">
              <h2 className="text-lg font-semibold">Recent events</h2>
              <Card className="py-2">
                <CardContent className="grid gap-1.5 px-4 py-2">
                  {data.recentMarkers.map((m, i) => (
                    <div key={`${m.date}-${i}`} className="flex items-center gap-2 text-sm">
                      {m.kind === "prescription" || m.kind === "medication" ? (
                        <Pill className="size-4 text-muted-foreground" />
                      ) : (
                        <Stethoscope className="size-4 text-muted-foreground" />
                      )}
                      <span className="tabular-nums text-muted-foreground">{fmtDate(m.date)}</span>
                      {m.label}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  );
}
