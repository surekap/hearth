import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { generateInsights, getInsights } from "@/lib/ai/insights";
import { AskView } from "./ask-view";

export default async function AskPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile } = await getActiveProfile(session.user.id);
  if (!profile) redirect("/profiles");

  // Pre-computed insights: reads are free; generation only runs when the
  // fingerprint says the underlying data changed (e.g. first visit).
  let insights = await getInsights(profile.id);
  if (insights.length === 0) {
    try {
      insights = await generateInsights(profile.id);
    } catch (e) {
      console.error("insight generation failed", e);
    }
  }

  return (
    <AskView
      profileId={profile.id}
      profileName={profile.displayName}
      initialInsights={insights.map((i) => ({
        id: i.id,
        title: i.title,
        body: i.body,
        tone: i.tone,
        category: i.category,
        model: i.model,
        createdAt: i.createdAt.toISOString(),
      }))}
    />
  );
}
