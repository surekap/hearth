import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { AlertTriangle, Dna, FileText, Pill } from "lucide-react";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { db, schema } from "@/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/mascot";

const RISK_TONE: Record<string, string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-[var(--warning)]/20 text-[color-mix(in_oklch,var(--warning),black_38%)]",
  normal: "bg-muted text-muted-foreground",
  low: "bg-emerald-600/10 text-emerald-700",
  unknown: "bg-muted text-muted-foreground",
};

const ACTION_TONE: Record<string, string> = {
  high_impact: "bg-destructive/10 text-destructive",
  actionable: "bg-[var(--warning)]/20 text-[color-mix(in_oklch,var(--warning),black_38%)]",
  informational: "bg-primary/10 text-primary",
  unknown: "bg-muted text-muted-foreground",
};

function fmtDate(value: Date | string | null) {
  if (!value) return "date unknown";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function GeneticsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile } = await getActiveProfile(session.user.id);
  if (!profile) redirect("/profiles");

  const [reports, risks, pgx, variants] = await Promise.all([
    db.query.geneticReports.findMany({
      where: eq(schema.geneticReports.profileId, profile.id),
      orderBy: [desc(schema.geneticReports.reportDate)],
    }),
    db.query.geneticRiskAssessments.findMany({
      where: eq(schema.geneticRiskAssessments.profileId, profile.id),
      orderBy: [desc(schema.geneticRiskAssessments.createdAt)],
      limit: 200,
    }),
    db.query.pharmacogenomicResults.findMany({
      where: eq(schema.pharmacogenomicResults.profileId, profile.id),
      orderBy: [desc(schema.pharmacogenomicResults.createdAt)],
      limit: 200,
    }),
    db.query.geneticVariants.findMany({
      where: eq(schema.geneticVariants.profileId, profile.id),
      orderBy: [desc(schema.geneticVariants.createdAt)],
      limit: 300,
    }),
  ]);

  const notableRisks = risks.filter(
    (r) => r.riskLevel === "high" || r.riskLevel === "medium"
  );
  const traits = risks.filter((r) => r.category === "trait");

  return (
    <div className="grid gap-6">
      <section className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge className="mb-2 bg-accent text-accent-foreground" variant="secondary">
              Genetics
            </Badge>
            <h1 className="text-3xl font-semibold">Genetic context</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Pharmacogenomics, disease predispositions, traits, and variants from confirmed
              genetic reports for {profile.displayName}.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/upload">
              <FileText className="size-4" />
              Upload report
            </Link>
          </Button>
        </div>

        <Card className="border-amber-300/70 bg-amber-50/70">
          <CardContent className="flex gap-3 py-4 text-sm text-amber-950">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <p>
              Genetic findings are static risk context, not diagnoses. Medication-response
              rows are doctor-discussion prompts only; re-check older reports against current
              clinical guidance before making decisions.
            </p>
          </CardContent>
        </Card>
      </section>

      {reports.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              mood="calm"
              title="No genetics yet"
              description="Upload a genetic report, review the extracted findings, and Hearth will keep them separate from routine lab trends."
            >
              <Button asChild>
                <Link href="/upload">Upload a genetic report</Link>
              </Button>
            </EmptyState>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <Dna className="mb-1 size-5 text-primary" />
                <CardTitle className="text-base">Reports</CardTitle>
                <CardDescription>Confirmed genetic report sources</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold">{reports.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Pill className="mb-1 size-5 text-primary" />
                <CardTitle className="text-base">Medication flags</CardTitle>
                <CardDescription>Drug-response findings to discuss</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold">{pgx.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <AlertTriangle className="mb-1 size-5 text-primary" />
                <CardTitle className="text-base">Notable risks</CardTitle>
                <CardDescription>High or medium genetic risk context</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold">{notableRisks.length}</p>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Medication response</CardTitle>
                <CardDescription>Show these before a relevant drug is prescribed.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {pgx.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pharmacogenomic rows confirmed.</p>
                ) : (
                  pgx.map((p) => (
                    <div key={p.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{p.drugName}</p>
                        <Badge className={ACTION_TONE[p.actionability]}>
                          {p.actionability.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{p.implication}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {[p.gene, p.genotype, p.phenotype].filter(Boolean).join(" / ") || "No genotype detail"}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Risk context</CardTitle>
                <CardDescription>Predisposition signals to view alongside real labs.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {notableRisks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No high or medium risk rows confirmed.</p>
                ) : (
                  notableRisks.map((r) => (
                    <div key={r.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{r.conditionName}</p>
                        <Badge className={RISK_TONE[r.riskLevel]}>{r.riskLevel}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {r.assessment ?? r.summary ?? "Risk assessment recorded"}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {r.lifetimeRiskPercent != null ? `Lifetime risk ${r.lifetimeRiskPercent}%` : "Lifetime risk not printed"}
                        {r.populationRiskPercent != null ? ` · population ${r.populationRiskPercent}%` : ""}
                        {r.variantScore ? ` · variant score ${r.variantScore}` : ""}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </section>

          {traits.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Traits</CardTitle>
                <CardDescription>Stable predisposition traits from reports.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {traits.map((t) => (
                  <div key={t.id} className="rounded-lg border p-3">
                    <p className="font-medium">{t.conditionName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t.assessment ?? t.summary ?? t.riskLevel}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <section className="grid gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,5fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Report provenance</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {reports.map((r) => (
                  <Link key={r.id} href={`/documents/${r.documentId}/review`}>
                    <div className="rounded-lg border p-3 transition-colors hover:bg-accent/40">
                      <p className="font-medium">{r.reportName ?? "Genetic report"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.vendor ?? "Unknown vendor"} · {r.testKind} · {fmtDate(r.reportDate)}
                      </p>
                      {r.summary && (
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{r.summary}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Variants</CardTitle>
                <CardDescription>Printed markers and genotypes, not reinterpreted.</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[520px] overflow-auto">
                {variants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No variant rows confirmed.</p>
                ) : (
                  <div className="grid gap-1.5">
                    {variants.map((v) => (
                      <div key={v.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border p-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {[v.gene, v.variantId ?? v.marker].filter(Boolean).join(" · ") || "Variant"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[v.chromosome && `chr ${v.chromosome}`, v.position && `pos ${v.position}`, v.sourceSection]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <Badge variant="outline">{v.genotype ?? "genotype n/a"}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
