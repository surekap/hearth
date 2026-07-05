import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser, requireProfile, handleApiError, ApiError, logAudit } from "@/lib/api";
import { processDocument } from "@/lib/extraction";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await requireUser();

    const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, id) });
    if (!doc) throw new ApiError(404, "Document not found");
    await requireProfile(userId, doc.profileId);

    const result = await processDocument(id);

    await logAudit({
      userId,
      profileId: doc.profileId,
      action: "extract",
      targetType: "document",
      targetId: id,
      detail: result,
    });

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e);
  }
}
