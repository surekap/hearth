import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oauthUserId, protectedResourceMetadata } from "./oauth";
const userId = "00000000-0000-4000-8000-000000000001";
const claims = { active: true, sub: "person", aud: "https://hearth.example/api/mcp", scope: "hearth:read", exp: 9999999999 };
beforeEach(() => {
  vi.stubEnv("HEARTH_MCP_OAUTH_ISSUER", "https://identity.example");
  vi.stubEnv("HEARTH_APP_URL", "https://hearth.example");
  vi.stubEnv("HEARTH_MCP_OAUTH_INTROSPECTION_URL", "https://identity.example/introspect");
  vi.stubEnv("HEARTH_MCP_OAUTH_CLIENT_ID", "hearth");
  vi.stubEnv("HEARTH_MCP_OAUTH_CLIENT_SECRET", "secret");
  vi.stubEnv("HEARTH_MCP_OAUTH_SUBJECTS", JSON.stringify({ person: userId }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("OAuth resource authorization", () => {
  it("advertises the exact resource and read scope", () => {
    expect(protectedResourceMetadata()).toMatchObject({ resource: claims.aud, scopes_supported: ["hearth:read"] });
  });
  it("maps a validated subject to a Hearth user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(claims)));
    expect(await oauthUserId("access-token")).toBe(userId);
  });
  it.each([
    { active: false }, { sub: "someone-else" }, { aud: "https://another-app" },
    { scope: "unrelated" }, { exp: 1 }, { nbf: 9999999999 }, { iss: "https://wrong-issuer" },
  ])("rejects invalid claims %j", async patch => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...claims, ...patch })));
    expect(await oauthUserId("access-token")).toBeNull();
  });
});
