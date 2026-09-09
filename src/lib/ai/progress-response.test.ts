import { describe, expect, it, vi } from "vitest";
import { progressResponse, readAskResponse } from "./progress-response";

describe("review progress transport", () => {
  it("sends heartbeats while retaining the final error status", async () => {
    vi.useFakeTimers();
    try {
      let finish!: (response: Response) => void;
      const response = progressResponse(() => new Promise((resolve) => { finish = resolve; }));
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      expect(decoder.decode((await reader.read()).value)).toContain('"progress"');
      await vi.advanceTimersByTimeAsync(10000);
      expect(decoder.decode((await reader.read()).value)).toContain('"progress"');
      finish(Response.json({ error: "Model unavailable" }, { status: 503 }));
      expect(JSON.parse(decoder.decode((await reader.read()).value))).toMatchObject({ type: "result", status: 503 });
      expect((await reader.read()).done).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it("parses fragmented UTF-8 and JSON while ignoring progress", async () => {
    const bytes = new TextEncoder().encode(`${JSON.stringify({ type: "progress" })}\n${JSON.stringify({ type: "result", status: 200, data: { answer: "72 → 60" } })}\n`);
    const body = new ReadableStream({ start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    } });
    expect(await readAskResponse(new Response(body, { headers: { "Content-Type": "application/x-ndjson" } }))).toEqual({ ok: true, data: { answer: "72 → 60" } });
  });
  it("preserves JSON API compatibility and gives a useful proxy failure message", async () => {
    expect(await readAskResponse(Response.json({ error: "Unauthorized" }, { status: 401 }))).toEqual({ ok: false, data: { error: "Unauthorized" } });
    await expect(readAskResponse(new Response("<html>timeout</html>", { status: 504 }))).rejects.toThrow(/saved answer/);
    await expect(readAskResponse(new Response('{"type":"progress"}\n', { headers: { "Content-Type": "application/x-ndjson" } }))).rejects.toThrow(/saved answer/);
  });
});
