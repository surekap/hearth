import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/api", () => ({ requireUser: vi.fn(), requireProfile: vi.fn(), ApiError: class extends Error { constructor(public status: number, message: string) { super(message); } }, handleApiError: (e: { status?: number; message: string }) => Response.json({ error: e.message }, { status: e.status ?? 500 }) }));
vi.mock("@/lib/record-search-data", () => ({ getSearchRecords: vi.fn() }));
vi.mock("@/lib/record-search-plan", () => ({ interpretSearch: vi.fn() }));
vi.mock("@/lib/record-search", async () => import("../../../../lib/record-search"));
import { requireUser, requireProfile, ApiError } from "@/lib/api";
import { getSearchRecords } from "@/lib/record-search-data";
import { interpretSearch } from "@/lib/record-search-plan";
import { POST } from "./route";
const profileId = "00000000-0000-4000-8000-000000000001";
const request = (query: string) => new Request("http://localhost/api/records/search", { method: "POST", body: JSON.stringify({ profileId, query }) });
beforeEach(() => { vi.resetAllMocks(); vi.mocked(requireUser).mockResolvedValue({ userId: "user", email: null }); });
describe("live search API", () => {
  it("rejects inaccessible profiles before reading records or interpreting queries", async () => {
    vi.mocked(requireProfile).mockRejectedValue(new ApiError(404, "Profile not found"));
    expect((await POST(request("kidney"))).status).toBe(404);
    expect(getSearchRecords).not.toHaveBeenCalled();
    expect(interpretSearch).not.toHaveBeenCalled();
  });
  it("requires three characters and limits query size on the server", async () => {
    expect((await POST(request("ab"))).status).toBe(200);
    expect(getSearchRecords).not.toHaveBeenCalled();
    expect(interpretSearch).not.toHaveBeenCalled();
    expect((await POST(request("a".repeat(501)))).status).toBe(400);
  });
  it("returns private results with explicit keyword fallback on model failure", async () => {
    vi.mocked(interpretSearch).mockRejectedValue(new Error("timeout"));
    vi.mocked(getSearchRecords).mockResolvedValue([{ id: "a", title: "Renal ultrasound", text: "Private extracted text", kind: "report", date: "2024-01-01", dateIsFallback: false, href: "/documents/a/review" }]);
    const response = await POST(request("renal"));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const data = await response.json();
    expect(data).toMatchObject({ mode: "keywords", total: 1 });
    expect(data.results[0]).not.toHaveProperty("text");
    expect(requireProfile).toHaveBeenCalledWith("user", profileId);
  });
});
