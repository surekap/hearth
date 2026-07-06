"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { requireProfile, requireProfileManager } from "@/lib/api";
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

export async function addProfileAccount(profileId: string, formData: FormData) {
  const invitingUserId = await requireUserId();
  const profile = await requireProfileManager(invitingUserId, profileId);

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "member") === "manager" ? "manager" : "member";

  if (!email || password.length < 8) return;

  const existingUser = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });

  let user = existingUser;
  if (!user) {
    const [createdUser] = await db
      .insert(schema.users)
      .values({
        email,
        name: profile.displayName,
        passwordHash: await bcrypt.hash(password, 12),
      })
      .returning();
    user = createdUser;
  }
  if (!user || user.id === profile.userId) return;

  await db
    .insert(schema.profileAccounts)
    .values({
      profileId,
      userId: user.id,
      role,
      invitedByUserId: invitingUserId,
    })
    .onConflictDoUpdate({
      target: [schema.profileAccounts.profileId, schema.profileAccounts.userId],
      set: {
        role,
        invitedByUserId: invitingUserId,
      },
    });

  revalidatePath("/", "layout");
}
