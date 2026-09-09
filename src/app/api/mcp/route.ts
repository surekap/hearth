import { eq } from "drizzle-orm";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { db, schema } from "@/db";
import { createHealthServer } from "@/lib/mcp/health-server";

import { oauthUserId, protectedResourceMetadata } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(process.env.HEARTH_APP_URL ?? request.url).origin;
  if (origin && origin !== expectedOrigin) return new Response("Forbidden origin", { status: 403 });
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  try {
    if (!token) return unauthorized();
    const oauthId = token.startsWith("hearth_") ? null : await oauthUserId(token);
    const user = await db.query.users.findFirst({
      where: oauthId ? eq(schema.users.id, oauthId) : eq(schema.users.apiToken, token),
      columns: { id: true },
    });
    if (!user) return unauthorized();
    // Request-local identity: never share a server or environment token between callers.
    const server = createHealthServer(async () => user.id);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(request);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } finally {
      await server.close();
    }
  } catch {
    return Response.json({ error: "MCP request failed" }, { status: 500 });
  }
}

function unauthorized() {
  const metadata = protectedResourceMetadata();
  const challenge = metadata
    ? `Bearer resource_metadata="${new URL("/.well-known/oauth-protected-resource/api/mcp", metadata.resource)}", scope="hearth:read"`
    : 'Bearer realm="hearth"';
  return Response.json({ error: "A valid Hearth bearer token is required" }, {
    status: 401, headers: { "WWW-Authenticate": challenge, "Cache-Control": "no-store" },
  });
}

// Stateless transport responds 405 for authenticated GET/DELETE requests.
// Unauthenticated discovery requests still receive the OAuth challenge.
export { POST as GET, POST as DELETE };
