import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, handleApiError, logAudit, requireProfile, requireUser } from "@/lib/api";
import { decryptBuffer } from "@/lib/crypto";
import { getObject } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await requireUser();
    const asset = await db.query.clinicalImages.findFirst({
      where: eq(schema.clinicalImages.id, id),
    });
    if (!asset) throw new ApiError(404, "Clinical image not found");
    await requireProfile(userId, asset.profileId);

    const encrypted = await getObject(asset.storageKey);
    const plain = decryptBuffer(encrypted);
    await logAudit({
      userId,
      profileId: asset.profileId,
      action: "view_clinical_image",
      targetType: "clinical_image",
      targetId: asset.id,
      detail: { documentId: asset.documentId, sourcePage: asset.sourcePage },
    });

    return new NextResponse(new Uint8Array(plain), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Disposition": `inline; filename="clinical-image-${asset.sourcePage ?? 1}.jpg"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
