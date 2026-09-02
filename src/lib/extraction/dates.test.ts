import { describe, expect, it } from "vitest";
import {
  countryDisplayName,
  dateConventionForCountry,
  earliestExtractedDate,
  isDateFormatUncertainty,
} from "./dates";

describe("dateConventionForCountry", () => {
  it("treats India, the UK and Europe as day-first", () => {
    expect(dateConventionForCountry("IN")).toBe("day_first");
    expect(dateConventionForCountry("gb")).toBe("day_first");
    expect(dateConventionForCountry("DE")).toBe("day_first");
  });

  it("treats the United States as month-first", () => {
    expect(dateConventionForCountry("US")).toBe("month_first");
  });

  it("gives no answer for mixed-convention or unknown countries", () => {
    expect(dateConventionForCountry("CA")).toBeNull();
    expect(dateConventionForCountry(null)).toBeNull();
    expect(dateConventionForCountry("India")).toBeNull();
  });
});

describe("countryDisplayName", () => {
  it("expands a code to a readable name", () => {
    expect(countryDisplayName("IN")).toBe("India");
    expect(countryDisplayName(null)).toBeNull();
  });
});

describe("isDateFormatUncertainty", () => {
  it("recognises the extractor's day/month doubt", () => {
    expect(isDateFormatUncertainty("Date format: 03/04/2026 could be DD/MM or MM/DD.")).toBe(true);
    expect(isDateFormatUncertainty("The report date 03/04/2026 is ambiguous.")).toBe(true);
  });

  it("leaves other uncertainties alone", () => {
    expect(isDateFormatUncertainty("The T4 unit is ambiguous.")).toBe(false);
    expect(isDateFormatUncertainty("Report date not printed on page 2.")).toBe(false);
  });
});

describe("earliestExtractedDate", () => {
  it("picks the earliest date across the document, observations and reports", () => {
    expect(
      earliestExtractedDate({
        report_date: null,
        observations: [{ report_date: "2026-03-10" }, { report_date: null }],
        reports: [{ report_date: "2026-02-01" }],
      })
    ).toBe("2026-02-01");
  });

  it("returns null when nothing is dated", () => {
    expect(earliestExtractedDate({ report_date: null, observations: [], reports: [] })).toBeNull();
  });
});
