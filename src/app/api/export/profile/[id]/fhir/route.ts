import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireProfile, handleApiError, logAudit } from "@/lib/api";
import { loadProfileBundle } from "@/lib/export/data";
import { buildFhirBundle } from "@/lib/export/fhir";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await requireUser();
    await requireProfile(userId, id);

    const bundle = await loadProfileBundle(id);
    const fhir = buildFhirBundle(bundle);
    await logAudit({ userId, profileId: id, action: "export", detail: { format: "fhir" } });

    return NextResponse.json(fhir, {
      headers: {
        "Content-Disposition": `attachment; filename="hearth-fhir-${bundle.profile.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json"`,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
