import { cookies } from "next/headers";
import { getAccessibleProfiles } from "@/lib/profile-access";
import { trySyncHealthBridgeProfile } from "@/lib/health-bridge/sync";

const COOKIE = "hearth_active_profile";

/**
 * Resolve the active profile for the signed-in user. Falls back to the first
 * profile if the cookie is missing or points at a profile the user doesn't own.
 */
export async function getActiveProfile(userId: string) {
  const jar = await cookies();
  const wanted = jar.get(COOKIE)?.value;

  const all = await getAccessibleProfiles(userId);
  if (all.length === 0) return { profile: null, profiles: all };

  const profile = all.find((p) => p.id === wanted) ?? all[0];
  await trySyncHealthBridgeProfile(profile.id);
  return { profile, profiles: all };
}

export async function setActiveProfileCookie(profileId: string) {
  const jar = await cookies();
  jar.set(COOKIE, profileId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
