import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { db, schema } from "@/db";
import { getMetricIndex } from "@/lib/health/metric";
import { MetricsIndexView } from "./metrics-index-view";

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ document?: string; scope?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile } = await getActiveProfile(session.user.id);
  if (!profile) redirect("/profiles");

  const query = await searchParams;
  const document = query.document
    ? await db.query.documents.findFirst({
        where: and(
          eq(schema.documents.id, query.document),
          eq(schema.documents.profileId, profile.id)
        ),
        columns: { id: true, originalFilename: true },
      })
    : null;
  const labOnly = Boolean(document && query.scope === "lab");
  const [index, allTypes] = await Promise.all([
    getMetricIndex(profile.id, {
      documentId: document?.id,
      labOnly,
    }),
    db.query.observationTypes.findMany({
      orderBy: [asc(schema.observationTypes.canonicalName)],
      columns: { id: true, canonicalName: true, category: true, normalUnit: true },
    }),
  ]);

  return (
    <MetricsIndexView
      profileId={profile.id}
      index={index}
      allTypes={allTypes}
      filter={
        document
          ? {
              documentId: document.id,
              documentName: document.originalFilename,
              scope: labOnly ? "lab" : "all",
            }
          : undefined
      }
    />
  );
}
