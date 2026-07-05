import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireProfile, handleApiError, logAudit } from "@/lib/api";
import { loadProfileBundle } from "@/lib/export/data";
import { buildDoctorPdf } from "@/lib/export/pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await requireUser();
    await requireProfile(userId, id);

    const bundle = await loadProfileBundle(id);
    const pdf = await buildDoctorPdf(bundle);
    await logAudit({ userId, profileId: id, action: "export", detail: { format: "pdf" } });

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="hearth-summary-${bundle.profile.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf"`,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
