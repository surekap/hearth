import { protectedResourceMetadata } from "@/lib/mcp/oauth";

export async function GET() {
  try {
    const metadata = protectedResourceMetadata();
    return Response.json(metadata ?? { error: "OAuth is not configured" }, {
      status: metadata ? 200 : 404,
      headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
    });
  } catch {
    return Response.json({ error: "OAuth configuration error" }, { status: 503 });
  }
}
