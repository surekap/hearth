import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { db, schema } from "@/db";
import { getMetricIndex } from "@/lib/health/metric";
import { MetricsIndexView } from "./metrics-index-view";

export default async function MetricsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile } = await getActiveProfile(session.user.id);
  if (!profile) redirect("/profiles");

  const [index, allTypes] = await Promise.all([
    getMetricIndex(profile.id),
    db.query.observationTypes.findMany({
      orderBy: [asc(schema.observationTypes.canonicalName)],
      columns: { id: true, canonicalName: true, category: true, normalUnit: true },
    }),
  ]);

  return <MetricsIndexView profileId={profile.id} index={index} allTypes={allTypes} />;
}
