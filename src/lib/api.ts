import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function requireUser() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new ApiError(401, "Not authenticated");
  return { userId, email: session.user.email ?? null };
}

/**
 * Profile isolation: every clinical query must be scoped to a profile that
 * belongs to the authenticated user. Returns the profile or throws 404.
 */
export async function requireProfile(userId: string, profileId: string) {
  const profile = await db.query.profiles.findFirst({
    where: and(eq(schema.profiles.id, profileId), eq(schema.profiles.userId, userId)),
  });
  if (!profile) throw new ApiError(404, "Profile not found");
  return profile;
}

export function handleApiError(e: unknown) {
  if (e instanceof ApiError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error(e);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function logAudit(entry: {
  userId?: string;
  profileId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: unknown;
}) {
  try {
    await db.insert(schema.auditLogs).values({
      userId: entry.userId ?? null,
      profileId: entry.profileId ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      detail: entry.detail ?? null,
    });
  } catch (e) {
    // Audit failures must never break the main flow.
    console.error("audit log failed", e);
  }
}
