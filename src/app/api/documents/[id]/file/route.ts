import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser, requireProfile, handleApiError, ApiError, logAudit } from "@/lib/api";
import { decryptBuffer } from "@/lib/crypto";
import { getObject } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Serves the decrypted original document to the authenticated owner.
 * This is the only path to plaintext bytes — storage only ever holds
 * AES-256-GCM ciphertext.
 */
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

    const encrypted = await getObject(doc.storageKey);
    const plain = decryptBuffer(encrypted);

    await logAudit({
      userId,
      profileId: doc.profileId,
      action: "view_document",
      targetType: "document",
      targetId: doc.id,
    });

    return new NextResponse(new Uint8Array(plain), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `inline; filename="${doc.originalFilename.replace(/[^\w.\- ]/g, "_")}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
