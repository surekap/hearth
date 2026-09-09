/** Keep the proxy connection active while the complete, validated answer is
 * prepared. Progress contains no patient data or unvalidated model output. */
export function progressResponse(work: () => Promise<Response>): Response {
  const encoder = new TextEncoder();
  let cancelled = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (value: unknown) => {
        if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      };
      send({ type: "progress" });
      timer = setInterval(() => send({ type: "progress" }), 10000);
      work().then(async (response) => {
        send({ type: "result", status: response.status, data: await response.json() });
      }).catch(() => {
        send({ type: "result", status: 500, data: { error: "The review could not be completed. Please try again." } });
      }).finally(() => {
        clearInterval(timer);
        if (!cancelled) controller.close();
      });
    },
    cancel() { cancelled = true; clearInterval(timer); },
  });
  return new Response(stream, { headers: {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  } });
}

/** Accept the progress protocol or the existing JSON API. Parse only complete
 * lines: fetch chunks can split both JSON tokens and UTF-8 characters. */
export async function readAskResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-ndjson")) {
    if (!contentType.includes("application/json")) throw new Error("The connection was interrupted. Reload this topic to check for a saved answer before retrying.");
    return { ok: response.ok, data: await response.json() };
  }
  if (!response.body) throw new Error("The review connection closed without an answer.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "result" && typeof event.status === "number" && event.data && typeof event.data === "object") {
          return { ok: event.status >= 200 && event.status < 300, data: event.data };
        }
      }
      if (done) break;
    }
    throw new Error("The connection closed before the review arrived. Reload this topic to check for a saved answer before retrying.");
  } finally { reader.releaseLock(); }
}
