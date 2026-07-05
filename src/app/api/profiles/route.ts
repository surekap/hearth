import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser, handleApiError } from "@/lib/api";

const createProfileSchema = z.object({
  displayName: z.string().min(1).max(100),
  relationship: z.enum(["self", "spouse", "child", "parent", "other"]).default("other"),
  dateOfBirth: z.string().date().nullish(),
  sexAtBirth: z.enum(["male", "female", "other", "unknown"]).default("unknown"),
  bloodGroup: z.string().max(10).nullish(),
  notes: z.string().max(2000).nullish(),
});

export async function GET() {
  try {
    const { userId } = await requireUser();
    const profiles = await db.query.profiles.findMany({
      where: eq(schema.profiles.userId, userId),
      orderBy: (p, { asc }) => [asc(p.createdAt)],
    });
    return NextResponse.json({ profiles });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const body = createProfileSchema.parse(await req.json());
    const [profile] = await db
      .insert(schema.profiles)
      .values({
        userId,
        displayName: body.displayName,
        relationship: body.relationship,
        dateOfBirth: body.dateOfBirth ?? null,
        sexAtBirth: body.sexAtBirth,
        bloodGroup: body.bloodGroup ?? null,
        notes: body.notes ?? null,
      })
      .returning();
    return NextResponse.json({ profile }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues }, { status: 400 });
    }
    return handleApiError(e);
  }
}
