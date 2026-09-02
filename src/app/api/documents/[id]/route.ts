import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser, requireProfile, handleApiError, ApiError } from "@/lib/api";

async function loadOwned(id: string, userId: string) {
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, id) });
  if (!doc) throw new ApiError(404, "Document not found");
  await requireProfile(userId, doc.profileId);
  return doc;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await requireUser();
    const doc = await loadOwned(id, userId);
    return NextResponse.json({ document: doc });
  } catch (e) {
    return handleApiError(e);
  }
}

const patchSchema = z.object({
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullable(),
});

/** User-set metadata. Today only the report date, for documents that print none. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await requireUser();
    await loadOwned(id, userId);

    const body = patchSchema.parse(await req.json());
    const [updated] = await db
      .update(schema.documents)
      .set({ documentDate: body.documentDate })
      .where(eq(schema.documents.id, id))
      .returning();

    return NextResponse.json({ document: updated });
  } catch (e) {
    return handleApiError(e);
  }
}
