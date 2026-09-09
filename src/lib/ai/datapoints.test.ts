import { describe, expect, it, vi } from "vitest";
vi.mock("@/db", () => ({ db: {}, schema: {} }));
import { shouldCaptureDatapoints } from "./datapoints";
describe("capture cost gate", () => {
  it.each(["Review my 2026 health", "What is my latest ALT?", "Why are my labs abnormal?", "Compare March and September scans"])("skips pure questions: %s", (q) => expect(shouldCaptureDatapoints(q)).toBe(false));
  it.each(["I've had pain all week", "I started running daily", "I stopped taking metformin", "My stomach hurts after dinner"])("retains concrete first-person statements: %s", (q) => expect(shouldCaptureDatapoints(q)).toBe(true));
});
