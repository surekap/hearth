import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, and } from "drizzle-orm";
import { FileText, FlaskConical, Pill, Stethoscope, Upload } from "lucide-react";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { db, schema } from "@/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/mascot";

type TimelineEvent = {
  date: Date;
  kind: "document" | "labs" | "report" | "manual" | "med";
  title: string;
  detail: string;
  href: string;
  badge?: { label: string; tone: "red" | "amber" | "green" | "blue" | "muted" };
};

const TYPE_LABELS: Record<string, string> = {
  lab_report: "Lab report",
  prescription: "Prescription",
  imaging: "Imaging report",
  specialist_report: "Specialist report",
  discharge_summary: "Discharge summary",
  invoice: "Invoice",
  other: "Document",
};

export default async function TimelinePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile } = await getActiveProfile(session.user.id);
  if (!profile) redirect("/profiles");

  const [docs, observations, reports, medEvents] = await Promise.all([
    db.query.documents.findMany({
      where: eq(schema.documents.profileId, profile.id),
      orderBy: [desc(schema.documents.uploadedAt)],
      limit: 200,
    }),
    db
      .select({
        id: schema.observations.id,
        documentId: schema.observations.documentId,
        observedAt: schema.observations.observedAt,
        interpretation: schema.observations.interpretation,
        source: schema.observations.source,
        valueNumeric: schema.observations.valueNumeric,
        valueText: schema.observations.valueText,
        unit: schema.observations.unit,
        typeName: schema.observationTypes.canonicalName,
      })
      .from(schema.observations)
      .innerJoin(
        schema.observationTypes,
        eq(schema.observations.observationTypeId, schema.observationTypes.id)
      )
      .where(
        and(
          eq(schema.observations.profileId, profile.id),
          eq(schema.observations.status, "confirmed")
        )
      )
      .orderBy(desc(schema.observations.observedAt))
      .limit(1000),
    db.query.clinicalReports.findMany({
      where: eq(schema.clinicalReports.profileId, profile.id),
      orderBy: [desc(schema.clinicalReports.createdAt)],
      limit: 100,
    }),
    db.query.medicationEvents.findMany({
      where: eq(schema.medicationEvents.profileId, profile.id),
      orderBy: [desc(schema.medicationEvents.eventTime)],
      limit: 200,
    }),
  ]);

  const events: TimelineEvent[] = [];

  // Documents (upload events)
  for (const d of docs) {
    const date = d.documentDate ? new Date(d.documentDate) : d.uploadedAt;
    events.push({
      date,
      kind: "document",
      title: `${TYPE_LABELS[d.documentType]} uploaded`,
      detail: d.originalFilename,
      href: `/documents/${d.id}/review`,
      badge:
        d.extractionStatus === "draft"
          ? { label: "needs review", tone: "amber" }
          : d.extractionStatus === "confirmed"
            ? { label: "confirmed", tone: "green" }
            : d.extractionStatus === "failed"
              ? { label: "extraction failed", tone: "red" }
              : undefined,
    });
  }

  // Confirmed lab batches per document
  const byDoc = new Map<string, typeof observations>();
  for (const o of observations) {
    if (o.source === "document" && o.documentId) {
      const list = byDoc.get(o.documentId) ?? [];
      list.push(o);
      byDoc.set(o.documentId, list);
    } else {
      events.push({
        date: o.observedAt,
        kind: "manual",
        title: `${o.typeName} recorded`,
        detail: `${o.valueNumeric ?? o.valueText ?? ""} ${o.unit ?? ""}`.trim(),
        href: `/labs`,
        badge:
          o.interpretation === "high" || o.interpretation === "critical"
            ? { label: o.interpretation, tone: "red" }
            : o.interpretation === "low"
              ? { label: "low", tone: "amber" }
              : undefined,
      });
    }
  }
  for (const [docId, list] of byDoc) {
    const abnormal = list.filter(
      (o) => o.interpretation !== "normal" && o.interpretation !== "unknown"
    ).length;
    events.push({
      date: list[0].observedAt,
      kind: "labs",
      title: `${list.length} lab values confirmed`,
      detail: list
        .slice(0, 4)
        .map((o) => o.typeName)
        .join(", ") + (list.length > 4 ? "…" : ""),
      href: `/documents/${docId}/review`,
      badge: abnormal
        ? { label: `${abnormal} abnormal`, tone: "red" }
        : { label: "all normal", tone: "green" },
    });
  }

  for (const r of reports) {
    events.push({
      date: r.reportDate ? new Date(r.reportDate) : r.createdAt,
      kind: "report",
      title: `${r.reportType === "imaging" ? "Imaging" : "Clinical"} report`,
      detail: r.impression ?? r.summary ?? "",
      href: `/documents/${r.documentId}/review`,
      badge: r.followUpRecommended
        ? { label: "follow-up recommended", tone: "amber" }
        : undefined,
    });
  }

  // Medication events (spec §12: medication started/stopped are timeline markers).
  // Routine intake logs are omitted to keep the timeline readable.
  const MED_LABEL: Record<string, string> = {
    prescribed: "prescribed",
    started: "started",
    stopped: "stopped",
    dose_changed: "dose changed",
  };
  for (const m of medEvents) {
    if (!(m.eventType in MED_LABEL)) continue;
    events.push({
      date: m.eventTime,
      kind: "med",
      title: `${m.nameText} ${MED_LABEL[m.eventType]}`,
      detail: [m.dose, m.frequency].filter(Boolean).join(" · "),
      href: "/meds",
      badge: { label: MED_LABEL[m.eventType], tone: "blue" },
    });
  }

  events.sort((a, b) => b.date.getTime() - a.date.getTime());

  // Group by month
  const groups = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const key = e.date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  const ICONS = {
    document: FileText,
    labs: FlaskConical,
    report: Stethoscope,
    manual: FlaskConical,
    med: Pill,
  } as const;

  const TONE = {
    red: "bg-destructive/10 text-destructive",
    amber: "bg-[var(--warning)]/20 text-[color-mix(in_oklch,var(--warning),black_38%)]",
    green: "bg-[var(--success)]/15 text-[color-mix(in_oklch,var(--success),black_28%)]",
    blue: "bg-primary/10 text-primary",
    muted: "bg-muted text-muted-foreground",
  } as const;

  const abnormalCount = events.filter((e) => e.badge?.tone === "red").length;
  const needsReviewCount = events.filter((e) => e.badge?.label === "needs review").length;

  return (
    <div className="grid gap-6">
      <section className="health-gradient -mx-4 -mt-6 grid gap-5 px-4 py-6 text-primary-foreground sm:rounded-b-lg md:mx-0 md:mt-0 md:rounded-lg md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <Badge className="mb-3 bg-white/14 text-white ring-1 ring-white/20" variant="secondary">
              {profile.displayName}&apos;s record
            </Badge>
            <h1 className="text-3xl font-semibold sm:text-4xl">Health timeline</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/78">
              Labs, reports, prescriptions, and manual entries in one scan-friendly history.
            </p>
          </div>
          <Button asChild className="bg-white text-slate-950 hover:bg-white/90">
            <Link href="/upload">
              <Upload className="size-4" />
              Upload
            </Link>
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-white/10 p-3 ring-1 ring-white/15">
            <p className="text-xs text-white/65">Total events</p>
            <p className="text-2xl font-semibold tabular-nums">{events.length}</p>
          </div>
          <div className="rounded-lg bg-white/10 p-3 ring-1 ring-white/15">
            <p className="text-xs text-white/65">Needs review</p>
            <p className="text-2xl font-semibold tabular-nums">{needsReviewCount}</p>
          </div>
          <div className="rounded-lg bg-white/10 p-3 ring-1 ring-white/15">
            <p className="text-xs text-white/65">Flagged values</p>
            <p className="text-2xl font-semibold tabular-nums">{abnormalCount}</p>
          </div>
        </div>
      </section>

      {events.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              mood="thinking"
              title="No health records yet"
              description={`Upload a lab report PDF and Pip will help Hearth extract values into ${profile.displayName}'s timeline.`}
            >
            <Button asChild>
              <Link href="/upload">Upload first report</Link>
            </Button>
            </EmptyState>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {[...groups.entries()].map(([month, list]) => (
            <div key={month}>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{month}</h2>
              <div className="grid gap-2 border-l-2 border-primary/15 pl-4">
                {list.map((e, i) => {
                  const Icon = ICONS[e.kind];
                  return (
                    <Link key={`${month}-${i}`} href={e.href}>
                      <Card className="interactive-card py-3">
                        <CardContent className="flex items-center gap-3 px-4">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                            <Icon className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{e.title}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {e.date.toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                              })}
                              {e.detail ? ` · ${e.detail}` : ""}
                            </p>
                          </div>
                          {e.badge && (
                            <Badge className={TONE[e.badge.tone]} variant="secondary">
                              {e.badge.label}
                            </Badge>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
