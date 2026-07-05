import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireProfile, handleApiError, logAudit } from "@/lib/api";
import { loadProfileBundle } from "@/lib/export/data";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await requireUser();
    await requireProfile(userId, id);

    const bundle = await loadProfileBundle(id);
    await logAudit({ userId, profileId: id, action: "export", detail: { format: "json" } });

    return NextResponse.json(
      {
        format: "hearth-internal-v1",
        exportedAt: new Date().toISOString(),
        profile: bundle.profile,
        observations: bundle.observations,
        documents: bundle.documents.map((d) => ({
          id: d.id,
          documentType: d.documentType,
          source: d.source,
          originalFilename: d.originalFilename,
          documentDate: d.documentDate,
          uploadedAt: d.uploadedAt,
          sha256Hash: d.sha256Hash,
        })),
        clinicalReports: bundle.reports,
        medicationEvents: bundle.medEvents,
        recentMedications: bundle.recentMeds,
      },
      {
        headers: {
          "Content-Disposition": `attachment; filename="hearth-${bundle.profile.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json"`,
        },
      }
    );
  } catch (e) {
    return handleApiError(e);
  }
}
