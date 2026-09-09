import { z } from "zod";
import { requireUser, requireProfile, handleApiError, ApiError } from "@/lib/api";
import { getSearchRecords } from "@/lib/record-search-data";
import { interpretSearch } from "@/lib/record-search-plan";
import { MIN_SEARCH_LENGTH, MAX_SEARCH_LENGTH, keywordPlan, searchRecords } from "@/lib/record-search";

const inputSchema = z.object({ profileId: z.string().uuid(), query: z.string().trim().max(MAX_SEARCH_LENGTH) });
export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, "Enter a valid search of up to 500 characters.");
    const { profileId, query } = parsed.data;
    await requireProfile(userId, profileId);
    const headers = { "Cache-Control": "private, no-store" };
    if (query.length < MIN_SEARCH_LENGTH) return Response.json({ results: [], total: 0, mode: "keywords", order: "newest" }, { headers });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const [records, interpreted] = await Promise.all([
      getSearchRecords(profileId),
      interpretSearch(query, `${userId}:${profileId}`, today).then(plan => ({ plan, mode: "interpreted" as const })).catch(() => ({ plan: keywordPlan(query), mode: "keywords" as const })),
    ]);
    const results = searchRecords(records, interpreted.plan);
    return Response.json({ results, total: results.length, mode: interpreted.mode, order: interpreted.plan.order }, { headers });
  } catch (error) { return handleApiError(error); }
}
