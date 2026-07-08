import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { getSystemData } from "@/lib/health/system";
import { parseRange } from "@/lib/health/series";
import { SystemView } from "./system-view";

export default async function SystemPage({
  params,
  searchParams,
}: {
  params: Promise<{ system: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile } = await getActiveProfile(session.user.id);
  if (!profile) redirect("/profiles");

  const { system } = await params;
  const { range: rangeParam } = await searchParams;
  const data = await getSystemData(profile.id, system, parseRange(rangeParam));
  if (!data) notFound();

  return <SystemView data={data} />;
}
