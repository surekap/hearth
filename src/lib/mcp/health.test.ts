import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

vi.mock("@/db", async () => ({
  schema: await import("../../db/schema"), db: { select: vi.fn() },
}));
vi.mock("@/lib/profile-access", () => ({ getProfileAccess: vi.fn(), getAccessibleProfiles: vi.fn() }));
import { db } from "@/db";
import { getAccessibleProfiles, getProfileAccess } from "@/lib/profile-access";
import { getFamilyHistory, getHealthRecords, profileSummary } from "./health";
import { createHealthServer } from "./health-server";
const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const profile = { id, userId: "owner", displayName: "Parent", relationship: "parent" as const,
  dateOfBirth: null, sexAtBirth: "unknown" as const, bloodGroup: null, notes: "Reported family history", createdAt: new Date() };
beforeEach(() => vi.resetAllMocks());
describe("health evidence access", () => {
  it("rejects mixed authorized/unauthorized selections before querying records", async () => {
    vi.mocked(getProfileAccess).mockImplementation(async (_user, profileId) => profileId === id ? { profile, role: "owner" } : null);
    await expect(getHealthRecords("owner", { profileIds: [id, other], category: "diagnoses" })).rejects.toThrow("not accessible");
    expect(db.select).not.toHaveBeenCalled();
  });
  it("enforces the same access boundary for family history", async () => {
    vi.mocked(getProfileAccess).mockResolvedValue(null);
    await expect(getFamilyHistory("owner", { profileIds: [other] })).rejects.toThrow("not accessible");
    expect(db.select).not.toHaveBeenCalled();
  });
  it("does not mislabel a shared profile's relationship", () => {
    expect(profileSummary(profile, "member").relationshipRelativeTo).toBe("profile_owner");
    expect(profileSummary(profile, "owner").relationshipRelativeTo).toBe("authenticated_user");
  });
  it("keeps profile identity and signals additional pages", async () => {
    vi.mocked(getProfileAccess).mockResolvedValue({ profile, role: "owner" });
    const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(), offset: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]) };
    vi.mocked(db.select).mockReturnValue(chain as never);
    const response = await getHealthRecords("owner", { profileIds: [id, id], category: "diagnoses", limit: 1 });
    expect(response.profiles).toHaveLength(1);
    expect(response.profiles[0]).toMatchObject({ profile: { id }, records: [{ id: "a" }], nextOffset: 1 });
    expect(chain.limit).toHaveBeenCalledWith(2);
  });
  it("supports actual MCP discovery and tool calls with read-only tools", async () => {
    vi.mocked(getAccessibleProfiles).mockResolvedValue([profile]);
    const server = createHealthServer(async () => "owner");
    const client = new Client({ name: "test-client", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const { tools } = await client.listTools();
      expect(tools.map(t => t.name)).toEqual(["hearth_list_profiles", "hearth_get_health_records", "hearth_get_family_history"]);
      expect(tools.every(t => t.annotations?.readOnlyHint)).toBe(true);
      const response = await client.callTool({ name: "hearth_list_profiles", arguments: {} });
      expect(response.structuredContent).toMatchObject({ profiles: [{ id }] });
      const invalid = await client.callTool({ name: "hearth_get_health_records", arguments: { profileIds: [], category: "diagnoses" } });
      expect(invalid.isError).toBe(true);
    } finally { await client.close(); await server.close(); }
  });
});
