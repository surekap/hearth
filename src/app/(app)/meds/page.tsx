import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { db, schema } from "@/db";
import { MedsView } from "./meds-view";

export default async function MedsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile } = await getActiveProfile(session.user.id);
  if (!profile) redirect("/profiles");

  const [recents, events] = await Promise.all([
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
  ]);

  return (
    <MedsView
      profileId={profile.id}
      profileName={profile.displayName}
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
