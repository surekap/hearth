import { describe, expect, it } from "vitest";
import { limitRecentMarkers, type Marker } from "./marker-utils";

describe("limitRecentMarkers", () => {
  it("keeps the newest events rather than allowing old medication events to hide imports", () => {
    const markers: Marker[] = Array.from({ length: 25 }, (_, index) => ({
      date: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      label: `Event ${index + 1}`,
      kind: index === 24 ? "report" : "medication",
    }));
    const limited = limitRecentMarkers(markers, 20);
    expect(limited).toHaveLength(20);
    expect(limited[0].label).toBe("Event 6");
    expect(limited.at(-1)).toMatchObject({ label: "Event 25", kind: "report" });
  });
});
