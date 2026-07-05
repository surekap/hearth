import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireProfile, handleApiError, ApiError } from "@/lib/api";
import { getMetabolicLiverData, type DashboardRange } from "@/lib/dashboard";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const sp = req.nextUrl.searchParams;
    const profileId = sp.get("profileId");
    if (!profileId) throw new ApiError(400, "profileId is required");
    await requireProfile(userId, profileId);

    const range = (sp.get("range") ?? "all") as DashboardRange;
    const data = await getMetabolicLiverData(profileId, range);
    return NextResponse.json(data);
  } catch (e) {
    return handleApiError(e);
  }
}
