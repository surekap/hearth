import { describe, expect, it } from "vitest";
import { claimsUnsuppliedPages } from "./openai";

// Verbatim warnings produced by the live extractor against real documents.
// The chunk-boundary ones are false: the pages they name were extracted by a
// different chunk of the same job.
const CHUNK_ARTIFACTS = [
  "The supplied pages are pages 1-12 of a 35-page document; pages 13-35 were not supplied.",
  "The supplied page 34 contains a body-composition report whose internal pagination indicates a possible missing third page, but only pages 34-35 were supplied.",
  "The report appears to continue beyond the supplied pages because page 34 is marked 'Page: 1 of 3'; page 36 was not supplied.",
];

// Real problems with pages the model actually received. These must survive.
const GENUINE = [
  "The conjugated bilirubin result on page 7 is not clearly printed and was not assigned a numeric value.",
  "Some spirometry predicted, LLN, percent-predicted, percent-change, FET, FIVC and PIF table values were not fully represented because of OCR/table ambiguity.",
  "Page 35 contains N/A entries throughout the lean mass balance table.",
  "Some parsed text contains OCR artifacts; values were cross-checked against the supplied page images where available.",
  "The exercise stress-test OCR contains a conflicting apparent maximum heart rate value in one fragment; the clearly printed report table and summary state 173 bpm.",
];

describe("claimsUnsuppliedPages", () => {
  it.each(CHUNK_ARTIFACTS)("flags the chunk-boundary artifact: %s", (warning) => {
    expect(claimsUnsuppliedPages(warning)).toBe(true);
  });

  it.each(GENUINE)("does not flag the genuine page problem: %s", (warning) => {
    expect(claimsUnsuppliedPages(warning)).toBe(false);
  });

  it("ignores text that never mentions pages", () => {
    expect(claimsUnsuppliedPages("The ECG report is marked 'Unconfirmed'.")).toBe(false);
  });
});
