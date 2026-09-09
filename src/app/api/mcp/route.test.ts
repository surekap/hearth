import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/db", async () => ({ schema: await import("../../../db/schema"), db: { query: { users: { findFirst: vi.fn() } } } }));
vi.mock("@/lib/profile-access", () => ({ getAccessibleProfiles: vi.fn().mockResolvedValue([]), getProfileAccess: vi.fn() }));
vi.mock("@/lib/mcp/oauth", () => ({ oauthUserId: vi.fn().mockResolvedValue(null), protectedResourceMetadata: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/mcp/health-server", () => import("../../../lib/mcp/health-server"));
import { db } from "@/db";
import { POST } from "./route";
beforeEach(() => vi.mocked(db.query.users.findFirst).mockReset());
function request(method: string, token?: string, origin?: string) {
  return new Request("https://hearth.example/api/mcp", {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: method === "initialize" ? { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } } : {} }),
  });
}
it("rejects missing and invalid credentials", async () => {
  expect((await POST(request("initialize"))).status).toBe(401);
  vi.mocked(db.query.users.findFirst).mockResolvedValue(undefined);
  expect((await POST(request("initialize", "hearth_invalid"))).status).toBe(401);
});
it("rejects foreign browser origins before authentication", async () => {
  expect((await POST(request("initialize", "hearth_token", "https://evil.example"))).status).toBe(403);
  expect(db.query.users.findFirst).not.toHaveBeenCalled();
});
it("initializes and lists only read tools over stateless HTTP", async () => {
  vi.mocked(db.query.users.findFirst).mockResolvedValue({ id: "user" } as never);
  const initialized = await POST(request("initialize", "hearth_token"));
  expect(initialized.status).toBe(200);
  expect(initialized.headers.get("Cache-Control")).toBe("no-store");
  expect(await initialized.json()).toMatchObject({ result: { serverInfo: { name: "hearth-health" } } });
  const response = await POST(request("tools/list", "hearth_token"));
  const body = await response.json();
  expect(body.result.tools).toHaveLength(3);
  expect(body.result.tools.every((tool: { annotations: { readOnlyHint: boolean } }) => tool.annotations.readOnlyHint)).toBe(true);
});
