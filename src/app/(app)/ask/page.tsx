import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { AskView } from "./ask-view";

export default async function AskPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile } = await getActiveProfile(session.user.id);
  if (!profile) redirect("/profiles");

  return <AskView profileId={profile.id} profileName={profile.displayName} />;
}
