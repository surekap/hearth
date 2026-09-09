import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureContext } from "./test-fixtures";
import { parseAnswer } from "./blocks";
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { create }; } }));
import { answerWithOpenAI } from "./answer";
const response = (overviewIds = ["E2"]) => ({
  status: "completed", output: [],
  usage: { input_tokens: 1000, output_tokens: 400, input_tokens_details: { cached_tokens: 200 } },
  output_text: JSON.stringify({
    overview: { text: "Improvements coexist with the newly documented gallstones.", evidenceIds: overviewIds },
    findings: [{ title: "Gallstones", text: "The September study documents them.", evidenceIds: ["E2"], priority: "attention", uncertainty: "Timing of development is uncertain." }],
    visuals: [{ type: "timeline", title: "Ultrasound findings", evidenceIds: ["E1", "E2"] }],
    nextSteps: [], limitations: [],
  }),
});
beforeEach(() => create.mockReset());
describe("analysis orchestration", () => {
  it("uses one structured call normally and logs actual token usage", async () => {
    create.mockResolvedValue(response());
    const result = await answerWithOpenAI("Review my health in 2026", fixtureContext());
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].store).toBe(false);
    expect(create.mock.calls[0][0].text.format.type).toBe("json_schema");
    expect(JSON.stringify(create.mock.calls[0][0].input)).toContain("No gallstones seen");
    expect(parseAnswer(result.answer).blocks[0].type).toBe("review");
    expect(result.trace).toMatchObject({ calls: 1, inputTokens: 1000, outputTokens: 400, cachedInputTokens: 200 });
  });
  it("repairs unsupported citations with a bounded retry", async () => {
    create.mockResolvedValueOnce(response(["invented"])).mockResolvedValueOnce(response());
    const result = await answerWithOpenAI("Review 2026", fixtureContext());
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.trace?.calls).toBe(2);
  });
  it("reads omitted evidence from the patient catalog before citing it", async () => {
    const context = fixtureContext();
    context.reports.push(...Array.from({ length: 70 }, (_, i) => ({
      ...context.reports[1], study: `Study ${i}`, findings: "Printed findings ".repeat(100),
    })));
    let requested = "";
    create.mockImplementationOnce(async (request) => {
      const packet = JSON.parse(request.input.at(-1).content);
      requested = packet.catalog.rows[0][0];
      expect(packet.evidence.some((e: { id: string }) => e.id === requested)).toBe(false);
      return { ...response(), output_text: "", output: [{
        type: "function_call", name: "read_evidence", call_id: "read-1", arguments: JSON.stringify({ ids: [requested] }),
      }] };
    }).mockImplementationOnce(async (request) => {
      const toolOutput = request.input.find((item: { type?: string }) => item.type === "function_call_output");
      expect(JSON.parse(toolOutput.output)[0].id).toBe(requested);
      const result = response([requested]);
      const answer = JSON.parse(result.output_text);
      answer.findings[0].evidenceIds = [requested];
      answer.visuals = [];
      return { ...result, output_text: JSON.stringify(answer) };
    });
    const result = await answerWithOpenAI("Review 2026", context);
    expect(result.trace?.calls).toBe(2);
    expect(result.trace?.reads).toHaveLength(1);
  });
  it("handles a provider refusal without pretending it is a validated clinical answer", async () => {
    create.mockResolvedValue({ ...response(), output: [{ type: "message", content: [{ type: "refusal", refusal: "Cannot provide that analysis." }] }] });
    const result = await answerWithOpenAI("Review 2026", fixtureContext());
    expect(result.answer).toBe("Cannot provide that analysis.");
    expect(result.trace?.validation).toBe("refusal");
  });
  it("fails instead of displaying partial or unvalidated output", async () => {
    create.mockResolvedValue({ ...response(), status: "incomplete" });
    await expect(answerWithOpenAI("Review 2026", fixtureContext())).rejects.toThrow(/did not finish/);
    create.mockReset().mockResolvedValue(response(["invented"]));
    await expect(answerWithOpenAI("Review 2026", fixtureContext())).rejects.toThrow(/could not be validated/);
    expect(create).toHaveBeenCalledTimes(3);
  });
});
