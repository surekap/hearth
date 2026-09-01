import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server.js";

const proxySource = readFileSync(new URL("./proxy.ts", import.meta.url), "utf8");
const matcher = proxySource.match(/matcher:\s*\[\s*"([^"]+)"/)?.[1];

if (!matcher) throw new Error("Could not read the static proxy matcher");

const config = { matcher: [matcher] };

describe("proxy matcher", () => {
  it("bypasses proxy for document uploads", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig: {},
        url: "/api/documents/upload",
      })
    ).toBe(false);
  });

  it("continues to protect application pages", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig: {},
        url: "/documents",
      })
    ).toBe(true);
  });
});
