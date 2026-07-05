import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { getAdaptiveDashboardData, type DashboardRange } from "@/lib/dashboard";
import { DashboardView } from "./dashboard-view";

const RANGES: DashboardRange[] = ["3m", "6m", "1y", "3y", "all"];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile } = await getActiveProfile(session.user.id);
  if (!profile) redirect("/profiles");

  const { range: rangeParam } = await searchParams;
  const range = RANGES.includes(rangeParam as DashboardRange)
    ? (rangeParam as DashboardRange)
    : "all";

  const data = await getAdaptiveDashboardData(profile.id, range);

  return <DashboardView profileName={profile.displayName} data={data} />;
}
