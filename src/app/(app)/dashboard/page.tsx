import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { getOverviewData } from "@/lib/health/overview";
import { OverviewView } from "./overview-view";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile } = await getActiveProfile(session.user.id);
  if (!profile) redirect("/profiles");

  const data = await getOverviewData(profile.id);
  return <OverviewView profileName={profile.displayName} data={data} />;
}
