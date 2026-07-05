"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { requireProfile } from "@/lib/api";
import { setActiveProfileCookie } from "@/lib/active-profile";

async function requireUserId() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  return userId;
}

export async function switchProfile(profileId: string) {
  const userId = await requireUserId();
  await requireProfile(userId, profileId);
  await setActiveProfileCookie(profileId);
  revalidatePath("/", "layout");
}

export async function createProfile(formData: FormData) {
  const userId = await requireUserId();
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) return;

  const relationship = String(formData.get("relationship") ?? "other") as
    | "self"
    | "spouse"
    | "child"
    | "parent"
    | "other";
  const dateOfBirth = String(formData.get("dateOfBirth") ?? "") || null;
  const sexAtBirth = String(formData.get("sexAtBirth") ?? "unknown") as
    | "male"
    | "female"
    | "other"
    | "unknown";
  const bloodGroup = String(formData.get("bloodGroup") ?? "") || null;

  const [profile] = await db
    .insert(schema.profiles)
    .values({ userId, displayName, relationship, dateOfBirth, sexAtBirth, bloodGroup })
    .returning();

  await setActiveProfileCookie(profile.id);
  revalidatePath("/", "layout");
}

export async function updateProfile(profileId: string, formData: FormData) {
  const userId = await requireUserId();
  await requireProfile(userId, profileId);

  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) return;

  await db
    .update(schema.profiles)
    .set({
      displayName,
      relationship: String(formData.get("relationship") ?? "other") as
        | "self"
        | "spouse"
        | "child"
        | "parent"
        | "other",
      dateOfBirth: (String(formData.get("dateOfBirth") ?? "") || null) as string | null,
      sexAtBirth: String(formData.get("sexAtBirth") ?? "unknown") as
        | "male"
        | "female"
        | "other"
        | "unknown",
      bloodGroup: String(formData.get("bloodGroup") ?? "") || null,
    })
    .where(eq(schema.profiles.id, profileId));

  revalidatePath("/", "layout");
}
