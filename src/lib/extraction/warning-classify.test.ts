import { describe, expect, it } from "vitest";
import {
  classifyWarning,
  extractPageNumber,
  partitionWarnings,
  classifyWarnings,
} from "./warning-classify";

// Every string below is a verbatim warning or uncertain item taken from the
// production database, so the classifier is measured against real extractor
// output rather than invented phrasing.

const MISSING_VALUE = [
  "The conjugated bilirubin result on page 7 is not clearly printed and was not assigned a numeric value.",
  "Page 7 shows a blank or unreadable result field for Bc (Conjugated Bilirubin); only its reference interval 0-0.3 mg/dL is legible.",
  "The result for Bc (Conjugated Bilirubin) is not clearly visible in the supplied parsed text/image; only its reference interval 0-0.3 mg/dL is represented.",
];

const PARTIAL_TABLE = [
  "Some spirometry predicted, LLN, percent-predicted, percent-change, FET, FIVC and PIF table values were not fully represented because of OCR/table ambiguity.",
  "Page 35 contains N/A entries throughout the lean mass balance table.",
  "The spirometry report contains additional predicted, LLN, percentage-predicted and percentage-change values; the principal populated values are represented in measurements.",
];

const AMBIGUITY = [
  "The Total Thyroxine (T4) unit is ambiguous as noted in warnings.",
  "The printed reference interval for Total T3 varies by age; the adult >20 years interval was used for this 44-year-old patient.",
  "The CEA reference interval is printed as '=< 3'; interpreted as an upper limit of 3 ng/mL.",
  "The exercise stress-test OCR contains a conflicting apparent maximum heart rate value in one fragment; the clearly printed report table and summary state 173 bpm.",
];

const NOTES = [
  "The ECG report is marked 'Unconfirmed'.",
  "The source identifies ethnicity as 'White'; this was transcribed exactly as printed.",
  "The report modality is inferred from the Lunar Prodigy Advance body-composition device; no explicit modality label is printed.",
  "The VAT and SAT graph axis values are printed but were not treated as patient measurements.",
];

describe("classifyWarning", () => {
  it.each(MISSING_VALUE)("treats a missing value as actionable: %s", (text) => {
    const result = classifyWarning(text);
    expect(result.kind).toBe("missing_value");
    expect(result.actionable).toBe(true);
  });

  it.each(PARTIAL_TABLE)("recognises a partial table: %s", (text) => {
    expect(classifyWarning(text).kind).toBe("partial_table");
  });

  it.each(AMBIGUITY)("recognises an ambiguity: %s", (text) => {
    expect(classifyWarning(text).kind).toBe("ambiguity");
  });

  it.each(NOTES)("files a provenance note as a note: %s", (text) => {
    const result = classifyWarning(text);
    expect(result.kind).toBe("note");
    expect(result.actionable).toBe(false);
  });

  it("prefers partial_table over ambiguity when the text mentions both", () => {
    expect(
      classifyWarning(
        "Some spirometry values were not fully represented because of OCR/table ambiguity."
      ).kind
    ).toBe("partial_table");
  });
});

describe("extractPageNumber", () => {
  it("reads a plain page reference", () => {
    expect(extractPageNumber("The result on page 7 is not clearly printed.")).toBe(7);
  });

  it("reads a colon-style page label", () => {
    expect(extractPageNumber("Page: 35 contains N/A entries.")).toBe(35);
  });

  it("returns null when no page is named", () => {
    expect(extractPageNumber("The ECG report is marked 'Unconfirmed'.")).toBeNull();
  });
});

describe("partitionWarnings", () => {
  it("keeps provenance notes out of the attention list", () => {
    const { attention, notes } = partitionWarnings(
      classifyWarnings([...MISSING_VALUE.slice(0, 1), ...NOTES])
    );
    expect(attention).toHaveLength(1);
    expect(notes).toHaveLength(NOTES.length);
  });
});
