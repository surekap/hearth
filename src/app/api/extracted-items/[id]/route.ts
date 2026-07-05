import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser, requireProfile, handleApiError, ApiError } from "@/lib/api";

const patchSchema = z.object({
  status: z.enum(["draft", "rejected"]).optional(),
  // Partial overrides merged into raw_json; user corrections to the draft.
  patch: z
    .object({
      test_name: z.string().optional(),
      canonical_name: z.string().nullable().optional(),
      observation_type_id: z.string().uuid().nullable().optional(),
      value: z.number().nullable().optional(),
      value_text: z.string().nullable().optional(),
      unit: z.string().nullable().optional(),
      reference_low: z.number().nullable().optional(),
      reference_high: z.number().nullable().optional(),
      report_date: z.string().nullable().optional(),
    })
    .optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await requireUser();

    const item = await db.query.extractedItems.findFirst({
      where: eq(schema.extractedItems.id, id),
    });
    if (!item) throw new ApiError(404, "Item not found");
    await requireProfile(userId, item.profileId);
    if (item.status === "accepted") throw new ApiError(409, "Item already accepted");

    const body = patchSchema.parse(await req.json());

    const rawJson = body.patch
      ? { ...(item.rawJson as Record<string, unknown>), ...body.patch }
      : item.rawJson;

    const [updated] = await db
      .update(schema.extractedItems)
      .set({
        rawJson,
        status: body.status ?? item.status,
        userCorrected: item.userCorrected || !!body.patch,
      })
      .where(eq(schema.extractedItems.id, id))
      .returning();

    return NextResponse.json({ item: updated });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues }, { status: 400 });
    }
    return handleApiError(e);
  }
}
