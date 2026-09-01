import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser, requireProfile, handleApiError, ApiError, logAudit } from "@/lib/api";
import { reextractPageRange, extractionProviderName } from "@/lib/extraction";

// A targeted re-read calls the model, so it is slower than a normal mutation.
export const maxDuration = 60;

const bodySchema = z.object({
  pageStart: z.number().int().positive(),
  pageEnd: z.number().int().positive(),
});

/**
 * Re-reads a page the first extraction under-extracted, appending only rows the
 * job does not already have. This is the remediation behind a `partial_table`
 * warning: the underlying gap is filled rather than the warning dismissed.
 */
export async function POST(
  req: NextRequest,
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

    // Same rule as accepting: a superseded job's rows are stale, so re-reading
    // into it would add drafts nobody will ever see.
    const latestJob = await db.query.extractionJobs.findFirst({
      where: eq(schema.extractionJobs.documentId, job.documentId),
      orderBy: [desc(schema.extractionJobs.createdAt)],
      columns: { id: true },
    });
    if (latestJob && latestJob.id !== job.id) {
      throw new ApiError(409, "This extraction has been superseded by a newer one.");
    }

    // Checked here as well as in the lib so the caller gets a usable message
    // rather than a generic 500 from an unexpected error.
    if (extractionProviderName() !== "openai") {
      throw new ApiError(
        400,
        "Re-reading a page needs the OpenAI extraction provider; the mock provider cannot re-read a document."
      );
    }

    const body = bodySchema.parse(await req.json());
    if (body.pageEnd < body.pageStart) {
      throw new ApiError(400, "pageEnd must not be before pageStart");
    }
    // A re-read is meant to be surgical; a wide range is just a slow full re-run.
    if (body.pageEnd - body.pageStart > 4) {
      throw new ApiError(400, "Re-read at most 5 pages at a time");
    }

    const result = await reextractPageRange({
      jobId: job.id,
      pageStart: body.pageStart,
      pageEnd: body.pageEnd,
    });

    await logAudit({
      userId,
      profileId: job.profileId,
      action: "extraction.reextract_page",
      targetType: "extraction_job",
      targetId: job.id,
      detail: { ...body, ...result },
    });

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues }, { status: 400 });
    }
    return handleApiError(e);
  }
}
