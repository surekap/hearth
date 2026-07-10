import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, handleApiError, logAudit, requireProfile, requireUser } from "@/lib/api";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await requireUser();

    const event = await db.query.medicationEvents.findFirst({
      where: eq(schema.medicationEvents.id, id),
    });
    if (!event) throw new ApiError(404, "Medication event not found");
    await requireProfile(userId, event.profileId);
    if (event.eventType !== "intake_logged") {
      throw new ApiError(400, "Only taken-dose events can be undone");
    }

    await db.transaction(async (tx) => {
      await tx.delete(schema.medicationEvents).where(eq(schema.medicationEvents.id, id));

      const whereSameMedicine = and(
        eq(schema.medicationEvents.profileId, event.profileId),
        eq(schema.medicationEvents.nameText, event.nameText)
      );

      const [latest] = await tx
        .select()
        .from(schema.medicationEvents)
        .where(whereSameMedicine)
        .orderBy(desc(schema.medicationEvents.eventTime))
        .limit(1);

      if (!latest) {
        await tx
          .delete(schema.recentMedications)
          .where(
            and(
              eq(schema.recentMedications.profileId, event.profileId),
              eq(schema.recentMedications.nameText, event.nameText)
            )
          );
        return;
      }

      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.medicationEvents)
        .where(whereSameMedicine);

      await tx
        .update(schema.recentMedications)
        .set({
          medicationMasterId: latest.medicationMasterId,
          dose: latest.dose,
          frequency: latest.frequency,
          courseStartDate: latest.courseStartDate,
          courseEndDate: latest.courseEndDate,
          courseDurationText: latest.courseDurationText,
          lastUsedAt: latest.eventTime,
          useCount: count,
        })
        .where(
          and(
            eq(schema.recentMedications.profileId, event.profileId),
            eq(schema.recentMedications.nameText, event.nameText)
          )
        );
    });

    await logAudit({
      userId,
      profileId: event.profileId,
      action: "medication_undo_taken",
      targetType: "medication_event",
      targetId: event.id,
      detail: { name: event.nameText, eventTime: event.eventTime.toISOString() },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
