import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser, requireProfile, handleApiError, ApiError, logAudit } from "@/lib/api";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await requireUser();

    const job = await db.query.extractionJobs.findFirst({
      where: eq(schema.extractionJobs.id, id),
    });
    if (!job) throw new ApiError(404, "Extraction not found");
    await requireProfile(userId, job.profileId);

    await db
      .update(schema.extractedItems)
      .set({ status: "rejected" })
      .where(
        and(
          eq(schema.extractedItems.extractionJobId, job.id),
          eq(schema.extractedItems.status, "draft")
        )
      );
    await db
      .update(schema.extractionJobs)
      .set({ status: "rejected" })
      .where(eq(schema.extractionJobs.id, job.id));
    await db
      .update(schema.documents)
      .set({ extractionStatus: "rejected" })
      .where(eq(schema.documents.id, job.documentId));

    await logAudit({
      userId,
      profileId: job.profileId,
      action: "reject_extraction",
      targetType: "extraction_job",
      targetId: job.id,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
