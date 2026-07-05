import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser, requireProfile, handleApiError, ApiError } from "@/lib/api";
import { computeInterpretation } from "@/lib/extraction/canonical";

async function loadOwned(id: string, userId: string) {
  const row = await db.query.observations.findFirst({
    where: eq(schema.observations.id, id),
  });
  if (!row) throw new ApiError(404, "Observation not found");
  await requireProfile(userId, row.profileId);
  return row;
}

const patchSchema = z.object({
  observedAt: z.string().optional(),
  valueNumeric: z.number().nullish(),
  valueText: z.string().nullish(),
  unit: z.string().nullish(),
  referenceLow: z.number().nullish(),
  referenceHigh: z.number().nullish(),
  status: z.enum(["draft", "confirmed", "rejected"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await requireUser();
    const row = await loadOwned(id, userId);

    const body = patchSchema.parse(await req.json());
    const valueNumeric =
      body.valueNumeric !== undefined ? body.valueNumeric : row.valueNumeric;
    const referenceLow =
      body.referenceLow !== undefined ? body.referenceLow : row.referenceLow;
    const referenceHigh =
      body.referenceHigh !== undefined ? body.referenceHigh : row.referenceHigh;

    const [updated] = await db
      .update(schema.observations)
      .set({
        observedAt: body.observedAt ? new Date(body.observedAt) : row.observedAt,
        valueNumeric,
        valueText: body.valueText !== undefined ? body.valueText : row.valueText,
        unit: body.unit !== undefined ? body.unit : row.unit,
        referenceLow,
        referenceHigh,
        status: body.status ?? row.status,
        interpretation: computeInterpretation(
          valueNumeric,
          referenceLow,
          referenceHigh,
          row.interpretation
        ),
        updatedAt: new Date(),
      })
      .where(eq(schema.observations.id, id))
      .returning();

    return NextResponse.json({ observation: updated });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues }, { status: 400 });
    }
    return handleApiError(e);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await requireUser();
    await loadOwned(id, userId);
    await db.delete(schema.observations).where(eq(schema.observations.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
