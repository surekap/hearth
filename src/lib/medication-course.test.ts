import { describe, expect, it } from "vitest";
import { derivePrescriptionCourse, isCourseExpired } from "./medication-course";

describe("medication course dates", () => {
  it("derives a two-week course from the prescription date", () => {
    expect(derivePrescriptionCourse(new Date("2026-07-10T09:00:00+05:30"), "2 weeks")).toEqual({
      courseStartDate: "2026-07-10",
      courseEndDate: "2026-07-24",
      courseDurationText: "2 weeks",
    });
  });

  it("handles written month durations", () => {
    expect(derivePrescriptionCourse(new Date("2026-01-15T00:00:00"), "one month")).toEqual({
      courseStartDate: "2026-01-15",
      courseEndDate: "2026-02-15",
      courseDurationText: "one month",
    });
  });

  it("detects courses that ended before today", () => {
    expect(isCourseExpired("2026-07-09", "2026-07-10")).toBe(true);
    expect(isCourseExpired("2026-07-10", "2026-07-10")).toBe(false);
  });
});
