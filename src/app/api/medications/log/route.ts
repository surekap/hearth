import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser, requireProfile, handleApiError, logAudit } from "@/lib/api";
import { db, schema } from "@/db";
import { isCourseExpired } from "@/lib/medication-course";
import { recordMedicationEvent, upsertMedicationMaster } from "@/lib/medications";

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const bodySchema = z.object({
  profileId: z.string().uuid(),
  nameText: z.string().min(1).max(200),
  dose: z.string().max(100).nullish(),
  route: z.string().max(50).nullish(),
  frequency: z.string().max(100).nullish(),
  courseStartDate: dateOnlySchema.nullish(),
  courseEndDate: dateOnlySchema.nullish(),
  courseDurationText: z.string().max(100).nullish(),
  eventType: z
    .enum(["prescribed", "started", "stopped", "intake_logged", "skipped", "dose_changed"])
    .default("intake_logged"),
  eventTime: z.string().datetime().optional(),
  notes: z.string().max(1000).nullish(),
  medicationMasterId: z.string().uuid().nullish(),
  addToDictionary: z.boolean().default(false),
  allowAfterCourseEnd: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const body = bodySchema.parse(await req.json());
    await requireProfile(userId, body.profileId);

    const recent = await db.query.recentMedications.findFirst({
      where: and(
        eq(schema.recentMedications.profileId, body.profileId),
        eq(schema.recentMedications.nameText, body.nameText)
      ),
    });

    const courseStartDate =
      body.courseStartDate ?? (body.eventType === "intake_logged" ? recent?.courseStartDate : null);
    const courseEndDate =
      body.courseEndDate ?? (body.eventType === "intake_logged" ? recent?.courseEndDate : null);
    const courseDurationText =
      body.courseDurationText ??
      (body.eventType === "intake_logged" ? recent?.courseDurationText : null);

    if (
      body.eventType === "intake_logged" &&
      isCourseExpired(courseEndDate) &&
      !body.allowAfterCourseEnd
    ) {
      return NextResponse.json(
        {
          error: "Medication course has ended. Use manual entry to log after the end date.",
          code: "course_ended",
          courseEndDate,
        },
        { status: 409 }
      );
    }

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
      courseStartDate,
      courseEndDate,
      courseDurationText,
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
      detail: { name: body.nameText, eventType: body.eventType, courseEndDate },
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues }, { status: 400 });
    }
    return handleApiError(e);
  }
}
