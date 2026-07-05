"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/api";

/** Generates (or rotates) the bearer token used by the iOS Shortcut upload flow. */
export async function regenerateApiToken() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const token = `hearth_${randomBytes(24).toString("base64url")}`;
  await db.update(schema.users).set({ apiToken: token }).where(eq(schema.users.id, userId));
  await logAudit({ userId, action: "api_token_rotated" });
  revalidatePath("/export");
}
