import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser, requireProfile, handleApiError, ApiError } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const profileId = req.nextUrl.searchParams.get("profileId");
    if (!profileId) throw new ApiError(400, "profileId is required");
    await requireProfile(userId, profileId);

    const docs = await db.query.documents.findMany({
      where: eq(schema.documents.profileId, profileId),
      orderBy: [desc(schema.documents.uploadedAt)],
    });
    return NextResponse.json({ documents: docs });
  } catch (e) {
    return handleApiError(e);
  }
}
