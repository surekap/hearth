import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser, requireProfile, handleApiError, ApiError } from "@/lib/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await requireUser();

    const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, id) });
    if (!doc) throw new ApiError(404, "Document not found");
    await requireProfile(userId, doc.profileId);

    return NextResponse.json({ document: doc });
  } catch (e) {
    return handleApiError(e);
  }
}
