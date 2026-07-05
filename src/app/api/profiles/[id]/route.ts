import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser, requireProfile, handleApiError } from "@/lib/api";

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  relationship: z.enum(["self", "spouse", "child", "parent", "other"]).optional(),
  dateOfBirth: z.string().date().nullish(),
  sexAtBirth: z.enum(["male", "female", "other", "unknown"]).optional(),
  bloodGroup: z.string().max(10).nullish(),
  notes: z.string().max(2000).nullish(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await requireUser();
    await requireProfile(userId, id);

    const body = updateProfileSchema.parse(await req.json());
    const [profile] = await db
      .update(schema.profiles)
      .set(body)
      .where(eq(schema.profiles.id, id))
      .returning();
    return NextResponse.json({ profile });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues }, { status: 400 });
    }
    return handleApiError(e);
  }
}
