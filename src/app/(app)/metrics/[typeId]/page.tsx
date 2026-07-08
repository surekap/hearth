import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { getMetricDetail } from "@/lib/health/metric";
import { parseRange } from "@/lib/health/series";
import { MetricView } from "./metric-view";

export default async function MetricPage({
  params,
  searchParams,
}: {
  params: Promise<{ typeId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile } = await getActiveProfile(session.user.id);
  if (!profile) redirect("/profiles");

  const { typeId } = await params;
  const { range: rangeParam } = await searchParams;
  const detail = await getMetricDetail(profile.id, typeId, parseRange(rangeParam));
  if (!detail) notFound();

  return <MetricView profileId={profile.id} detail={detail} />;
}
