import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { scheduleInsightRefresh } from "@/lib/ai/insights";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser, requireProfile, handleApiError, ApiError } from "@/lib/api";
import { computeInterpretation } from "@/lib/extraction/canonical";
import { normalizeMetricRecord } from "@/lib/health/normalization";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const sp = req.nextUrl.searchParams;
    const profileId = sp.get("profileId");
    if (!profileId) throw new ApiError(400, "profileId is required");
    await requireProfile(userId, profileId);

    const conditions = [eq(schema.observations.profileId, profileId)];
    const typeId = sp.get("typeId");
    if (typeId) conditions.push(eq(schema.observations.observationTypeId, typeId));
    const status = sp.get("status") ?? "confirmed";
    if (status !== "all") {
      conditions.push(
        eq(schema.observations.status, status as "draft" | "confirmed" | "rejected")
      );
    }

    const rows = await db.query.observations.findMany({
      where: and(...conditions),
      orderBy: [desc(schema.observations.observedAt)],
      limit: 1000,
    });
    return NextResponse.json({ observations: rows });
  } catch (e) {
    return handleApiError(e);
  }
}

const createSchema = z.object({
  profileId: z.string().uuid(),
  observationTypeId: z.string().uuid(),
  observedAt: z.string(),
  valueNumeric: z.number().nullish(),
  valueText: z.string().nullish(),
  unit: z.string().nullish(),
  referenceLow: z.number().nullish(),
  referenceHigh: z.number().nullish(),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const body = createSchema.parse(await req.json());
    await requireProfile(userId, body.profileId);

    const type = await db.query.observationTypes.findFirst({
      where: eq(schema.observationTypes.id, body.observationTypeId),
    });
    if (!type) throw new ApiError(400, "Unknown observation type");
    const normalized = normalizeMetricRecord({
      metric: type.canonicalName,
      normalUnit: type.normalUnit,
      unit: body.unit ?? type.normalUnit,
      valueNumeric: body.valueNumeric ?? null,
      referenceLow: body.referenceLow ?? null,
      referenceHigh: body.referenceHigh ?? null,
    });

    const [row] = await db
      .insert(schema.observations)
      .values({
        profileId: body.profileId,
        observationTypeId: body.observationTypeId,
        observedAt: new Date(body.observedAt),
        valueNumeric: normalized.valueNumeric,
        valueText: body.valueText ?? null,
        unit: normalized.unit,
        referenceLow: normalized.referenceLow,
        referenceHigh: normalized.referenceHigh,
        interpretation: computeInterpretation(
          normalized.valueNumeric,
          normalized.referenceLow,
          normalized.referenceHigh,
          "unknown"
        ),
        source: "manual",
        status: "confirmed",
      })
      .returning();

    after(() => scheduleInsightRefresh(body.profileId));

    return NextResponse.json({ observation: row }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues }, { status: 400 });
    }
    return handleApiError(e);
  }
}
