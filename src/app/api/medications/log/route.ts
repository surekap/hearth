import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireProfile, handleApiError, logAudit } from "@/lib/api";
import { recordMedicationEvent, upsertMedicationMaster } from "@/lib/medications";

const bodySchema = z.object({
  profileId: z.string().uuid(),
  nameText: z.string().min(1).max(200),
  dose: z.string().max(100).nullish(),
  route: z.string().max(50).nullish(),
  frequency: z.string().max(100).nullish(),
  eventType: z
    .enum(["prescribed", "started", "stopped", "intake_logged", "skipped", "dose_changed"])
    .default("intake_logged"),
  eventTime: z.string().datetime().optional(),
  notes: z.string().max(1000).nullish(),
  medicationMasterId: z.string().uuid().nullish(),
  addToDictionary: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const body = bodySchema.parse(await req.json());
    await requireProfile(userId, body.profileId);

    let masterId = body.medicationMasterId ?? null;
    if (!masterId && body.addToDictionary) {
      const master = await upsertMedicationMaster({
        brandName: body.nameText,
        strength: body.dose,
        source: "manual",
      });
      masterId = master?.id ?? null;
    }

    const event = await recordMedicationEvent({
      profileId: body.profileId,
      nameText: body.nameText,
      dose: body.dose,
      route: body.route,
      frequency: body.frequency,
      eventType: body.eventType,
      eventTime: body.eventTime ? new Date(body.eventTime) : undefined,
      notes: body.notes,
      medicationMasterId: masterId,
    });

    await logAudit({
      userId,
      profileId: body.profileId,
      action: "medication_log",
      targetType: "medication_event",
      targetId: event.id,
      detail: { name: body.nameText, eventType: body.eventType },
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues }, { status: 400 });
    }
    return handleApiError(e);
  }
}
