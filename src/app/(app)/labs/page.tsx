import { redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { db, schema } from "@/db";
import { LabsView } from "./labs-view";

export default async function LabsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile } = await getActiveProfile(session.user.id);
  if (!profile) redirect("/profiles");

  const rows = await db
    .select({
      id: schema.observations.id,
      observedAt: schema.observations.observedAt,
      valueNumeric: schema.observations.valueNumeric,
      valueText: schema.observations.valueText,
      unit: schema.observations.unit,
      referenceLow: schema.observations.referenceLow,
      referenceHigh: schema.observations.referenceHigh,
      interpretation: schema.observations.interpretation,
      source: schema.observations.source,
      typeId: schema.observationTypes.id,
      typeName: schema.observationTypes.canonicalName,
      category: schema.observationTypes.category,
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
    .orderBy(desc(schema.observations.observedAt));

  const allTypes = await db.query.observationTypes.findMany({
    orderBy: [asc(schema.observationTypes.canonicalName)],
    columns: { id: true, canonicalName: true, category: true, normalUnit: true },
  });

  return (
    <LabsView
      profileId={profile.id}
      profileName={profile.displayName}
      rows={rows.map((r) => ({ ...r, observedAt: r.observedAt.toISOString() }))}
      allTypes={allTypes}
    />
  );
}
