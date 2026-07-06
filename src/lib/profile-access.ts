import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export type ProfileAccessRole = "owner" | "manager" | "member";

export async function getAccessibleProfiles(userId: string) {
  const [owned, grantedRows] = await Promise.all([
    db.query.profiles.findMany({
      where: eq(schema.profiles.userId, userId),
      orderBy: (p, { asc }) => [asc(p.createdAt)],
    }),
    db
      .select({ profile: schema.profiles })
      .from(schema.profileAccounts)
      .innerJoin(schema.profiles, eq(schema.profileAccounts.profileId, schema.profiles.id))
      .where(eq(schema.profileAccounts.userId, userId))
      .orderBy(asc(schema.profiles.createdAt)),
  ]);

  const byId = new Map<string, (typeof owned)[number]>();
  for (const profile of owned) byId.set(profile.id, profile);
  for (const { profile } of grantedRows) byId.set(profile.id, profile);
  return [...byId.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function getProfileAccess(userId: string, profileId: string) {
  const owned = await db.query.profiles.findFirst({
    where: and(eq(schema.profiles.id, profileId), eq(schema.profiles.userId, userId)),
  });
  if (owned) return { profile: owned, role: "owner" as const };

  const [granted] = await db
    .select({
      profile: schema.profiles,
      role: schema.profileAccounts.role,
    })
    .from(schema.profileAccounts)
    .innerJoin(schema.profiles, eq(schema.profileAccounts.profileId, schema.profiles.id))
    .where(
      and(
        eq(schema.profileAccounts.profileId, profileId),
        eq(schema.profileAccounts.userId, userId)
      )
    )
    .limit(1);

  if (!granted) return null;
  return { profile: granted.profile, role: granted.role as ProfileAccessRole };
}
