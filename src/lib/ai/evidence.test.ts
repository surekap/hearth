import { describe, expect, it } from "vitest";
import { budgetHistory, collectEvidence, compactEvidencePacket, comparisonCaveat, packEvidence, resolveDateScope } from "./evidence";
import { fixtureContext, documentA } from "./test-fixtures";
import { redactDeep } from "./redact";

const now = new Date("2026-09-09T00:00:00Z");
describe("evidence selection", () => {
  it("retains full findings and provenance across the review period", () => {
    const packet = packEvidence(fixtureContext(), "Review my 2026 health", [], 48000, now);
    expect(packet.packet.evidence.some((e) => JSON.stringify(e).includes("No gallstones seen"))).toBe(true);
    expect(packet.packet.evidence.some((e) => JSON.stringify(e).includes("largest 10 mm"))).toBe(true);
    expect(packet.all[0]).toMatchObject({ documentId: documentA, page: 2 });
    expect(JSON.stringify(packet.packet.evidence)).not.toContain(documentA);
  });
  it("represents excluded evidence in a catalog rather than silently claiming completeness", () => {
    const packet = packEvidence(fixtureContext(), "Review 2026", [], 700, now);
    const wire = compactEvidencePacket(packet.packet);
    expect(JSON.stringify(wire.evidence).length + JSON.stringify(wire.observations.rows).length).toBeLessThan(750);
    expect(packet.packet.coverage.omitted).toBeGreaterThan(0);
    expect(packet.packet.catalog.length).toBe(packet.packet.coverage.omitted);
  });
  it("marks documents without extracted evidence as a coverage gap", () => {
    const context = fixtureContext();
    context.documents = [{ id: "missing", name: "New scan", date: "2026-09-01", status: "pending" }];
    expect(packEvidence(context, "Review 2026", [], 48000, now).packet.coverage.documentsWithoutEvidence).toHaveLength(1);
  });
  it("does not include later measurements in an earlier review period", () => {
    const packed = packEvidence(fixtureContext(), "Review March 2026", [], 48000, now);
    expect(packed.selected.every((e) => e.date?.startsWith("2026-03"))).toBe(true);
  });
  it("keeps an earlier baseline but explicitly labels it outside the period", () => {
    const context = fixtureContext();
    context.observations[2].date = "2026-01-10";
    const packed = packEvidence(context, "Review March to September 2026", [], 48000, now);
    expect(packed.packet.evidence.find((e) => e.date === "2026-01-10")).toMatchObject({ role: "Prior baseline outside requested period" });
    expect(packed.packet.coverage.priorBaselines).toBe(1);
  });
  it("exposes a cross-machine caveat instead of a lean-mass delta", () => {
    const packed = packEvidence(fixtureContext(), "Review 2026", [], 48000, now);
    const comparison = packed.packet.comparisons.find((c) => c.test === "Lean mass");
    expect(comparison?.caveat).toContain("scanner");
    expect(comparison?.delta).toBeUndefined();
  });
  it("rejects differing units and same-day trend comparisons", () => {
    const evidence = collectEvidence(fixtureContext()).filter((e) => e.label === "ALT");
    evidence[1].data.unit = "different";
    expect(comparisonCaveat(evidence)).toContain("Units differ");
    evidence[1].data.unit = "U/L";
    evidence[1].date = evidence[0].date;
    expect(comparisonCaveat(evidence)).toContain("Same-day");
  });
});
describe("scope and token savings", () => {
  it("preserves exact observations and their provenance in the compact transport", () => {
    const packed = packEvidence(fixtureContext(), "Review 2026", [], 48000, now);
    const wire = compactEvidencePacket(packed.packet);
    for (const row of wire.observations.rows) {
      const restored = Object.fromEntries(wire.observations.columns.map((key, i) => [key, row[i] ?? null]));
      const original = packed.packet.evidence.find((e) => e.id === restored.id)!;
      for (const key of wire.observations.columns) expect(restored[key]).toEqual((original as Record<string, unknown>)[key] ?? null);
    }
    expect(wire.evidence.every((e) => e.kind !== "observation")).toBe(true);
    expect(JSON.stringify(wire).length).toBeLessThan(JSON.stringify(packed.packet).length);
  });
  it("does not displace in-period comparisons with older baselines", () => {
    const context = fixtureContext();
    context.observations.push({ ...context.observations[2], date: "2025-03-01", value: 132 });
    const packed = packEvidence(context, "Review 2026", [], 48000, now);
    expect(packed.selected.some((e) => e.date === "2025-03-01")).toBe(false);
    expect(packed.packet.comparisons.find((c) => c.test === "ALT")?.delta).toBe(-40);
  });
  it("reserves both dates under a tight budget, retaining unit mismatches as caveats", () => {
    const context = fixtureContext();
    context.reports = [];
    context.observations[3].unit = "IU/L";
    const packed = packEvidence(context, "Compare ALT during 2026", [], 240, now);
    expect(packed.selected.filter((e) => e.label === "ALT")).toHaveLength(2);
    expect(packed.packet.comparisons.find((c) => c.test === "ALT")?.caveat).toContain("Units differ");
  });
  it("resolves calendar years and named month ranges", () => {
    expect(resolveDateScope("Review 2026", now)).toMatchObject({ from: "2026-01-01", to: "2026-12-31" });
    expect(resolveDateScope("Compare March and September 2026", now)).toMatchObject({ from: "2026-03-01", to: "2026-09-30" });
    expect(resolveDateScope("last 6 months", now)).toMatchObject({ from: "2026-03-09", to: "2026-09-09" });
  });
  it("keeps whole recent turns inside a history budget", () => {
    const history = [{ question: "old", answer: "x".repeat(1000) }, { question: "latest", answer: "short" }];
    expect(budgetHistory(history, 100)).toEqual([history[1]]);
  });
  it("reduces a dense record packet while keeping endpoints and an omission count", () => {
    const context = fixtureContext();
    context.observations.push(...Array.from({ length: 1500 }, (_, i) => ({
      ...context.observations[0], date: new Date(Date.UTC(2022, 0, i + 1)).toISOString().slice(0, 10), value: 95 + i / 1000,
    })));
    const packed = packEvidence(context, "Review my full history", [], 48000, now);
    expect(JSON.stringify(packed.packet).length).toBeLessThan(JSON.stringify(context).length / 2);
    expect(packed.packet.coverage.omitted).toBeGreaterThan(0);
  });
  it("does not corrupt opaque source IDs while redacting patient text", () => {
    const result = redactDeep({ documentId: "12345678-1234-4123-8123-123456789012", summary: "Prateek's scan" }, ["Prateek"]);
    expect(result.documentId).toBe("12345678-1234-4123-8123-123456789012");
    expect(result.summary).toContain("[NAME]");
  });
});
