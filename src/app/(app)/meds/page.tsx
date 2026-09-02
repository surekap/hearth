import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { db, schema } from "@/db";
import { MedsView } from "./meds-view";
import type { PgxResult } from "@/lib/health/pgx-match";

export default async function MedsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile } = await getActiveProfile(session.user.id);
  if (!profile) redirect("/profiles");

  const [recents, events, pgx] = await Promise.all([
    db.query.recentMedications.findMany({
      where: eq(schema.recentMedications.profileId, profile.id),
      orderBy: [desc(schema.recentMedications.lastUsedAt)],
      limit: 20,
    }),
    db.query.medicationEvents.findMany({
      where: eq(schema.medicationEvents.profileId, profile.id),
      orderBy: [desc(schema.medicationEvents.eventTime)],
      limit: 100,
    }),
    db.query.pharmacogenomicResults.findMany({
      where: eq(schema.pharmacogenomicResults.profileId, profile.id),
      columns: {
        drugName: true,
        gene: true,
        phenotype: true,
        implication: true,
        actionability: true,
        recommendationSummary: true,
      },
    }),
  ]);
  const pharmacogenomics: PgxResult[] = pgx;

  return (
    <MedsView
      profileId={profile.id}
      profileName={profile.displayName}
      pharmacogenomics={pharmacogenomics}
      recents={recents.map((r) => ({
        nameText: r.nameText,
        dose: r.dose,
        frequency: r.frequency,
        courseStartDate: r.courseStartDate,
        courseEndDate: r.courseEndDate,
        courseDurationText: r.courseDurationText,
        lastUsedAt: r.lastUsedAt.toISOString(),
        useCount: r.useCount,
      }))}
      events={events.map((e) => ({
        id: e.id,
        nameText: e.nameText,
        dose: e.dose,
        frequency: e.frequency,
        courseStartDate: e.courseStartDate,
        courseEndDate: e.courseEndDate,
        courseDurationText: e.courseDurationText,
        eventType: e.eventType,
        eventTime: e.eventTime.toISOString(),
        notes: e.notes,
      }))}
    />
  );
}
