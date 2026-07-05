import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireProfile, handleApiError, ApiError, logAudit } from "@/lib/api";
import { generateInsights, getInsights } from "@/lib/ai/insights";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const profileId = req.nextUrl.searchParams.get("profileId");
    if (!profileId) throw new ApiError(400, "profileId is required");
    await requireProfile(userId, profileId);
    return NextResponse.json({ insights: await getInsights(profileId) });
  } catch (e) {
    return handleApiError(e);
  }
}

const postSchema = z.object({ profileId: z.string().uuid() });

/** Force-regenerate (the "Refresh" button on the Ask tab). */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const { profileId } = postSchema.parse(await req.json());
    await requireProfile(userId, profileId);

    const insights = await generateInsights(profileId, { force: true });
    await logAudit({ userId, profileId, action: "ai_insights_refresh" });
    return NextResponse.json({ insights });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues }, { status: 400 });
    }
    return handleApiError(e);
  }
}
