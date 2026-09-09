import { z } from "zod/v4";

const httpsUrl = z.url().refine(value => new URL(value).protocol === "https:", "HTTPS required");
const configSchema = z.object({
  issuer: httpsUrl,
  resource: httpsUrl,
  introspectionUrl: httpsUrl,
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  subjects: z.record(z.string(), z.string().uuid()),
});

export function oauthConfig() {
  if (!process.env.HEARTH_MCP_OAUTH_ISSUER) return null;
  return configSchema.parse({
    issuer: process.env.HEARTH_MCP_OAUTH_ISSUER,
    resource: `${process.env.HEARTH_APP_URL?.replace(/\/$/, "")}/api/mcp`,
    introspectionUrl: process.env.HEARTH_MCP_OAUTH_INTROSPECTION_URL,
    clientId: process.env.HEARTH_MCP_OAUTH_CLIENT_ID,
    clientSecret: process.env.HEARTH_MCP_OAUTH_CLIENT_SECRET,
    subjects: JSON.parse(process.env.HEARTH_MCP_OAUTH_SUBJECTS ?? "{}"),
  });
}

const tokenSchema = z.object({
  active: z.literal(true), sub: z.string(), iss: z.string().optional(),
  aud: z.union([z.string(), z.array(z.string())]),
  scope: z.string(), exp: z.number(), nbf: z.number().optional(),
});

export async function oauthUserId(token: string): Promise<string | null> {
  const config = oauthConfig();
  if (!config) return null;
  const response = await fetch(config.introspectionUrl, {
    method: "POST", redirect: "error", cache: "no-store",
    signal: AbortSignal.timeout(10000),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`).toString("base64")}`,
    },
    body: new URLSearchParams({ token, token_type_hint: "access_token" }),
  });
  if (!response.ok) return null;
  const parsed = tokenSchema.safeParse(await response.json());
  if (!parsed.success) return null;
  const claims = parsed.data;
  const now = Date.now() / 1000;
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.exp <= now || (claims.nbf !== undefined && claims.nbf > now)
    || (claims.iss !== undefined && claims.iss !== config.issuer)
    || !audience.includes(config.resource) || !claims.scope.split(/\s+/).includes("hearth:read")) return null;
  return Object.hasOwn(config.subjects, claims.sub) ? config.subjects[claims.sub] : null;
}

export function protectedResourceMetadata() {
  const config = oauthConfig();
  return config ? {
    resource: config.resource, authorization_servers: [config.issuer],
    scopes_supported: ["hearth:read"], bearer_methods_supported: ["header"],
    resource_name: "Hearth health records",
  } : null;
}
