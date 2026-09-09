# Hearth health MCP

Hearth exposes clinical evidence so an MCP client can answer questions about one person, compare selected profiles, or investigate family history. The client LLM writes the answer; these tools query Hearth directly and do not invoke another model.

## Read tools

- `hearth_list_profiles`: discover owned and shared profiles, demographics, notes and owner-relative relationship labels.
- `hearth_get_health_records`: retrieve records for 1–10 explicit `profileIds`, selecting `observations`, `diagnoses`, `reports`, `medications`, `healthEvents`, `healthRollups`, `geneticReports`, `geneticVariants`, `geneticRisks` or `pharmacogenomics`.
- `hearth_get_family_history`: retrieve selected profiles' notes, diagnoses, reports and genetic risks, with guidance on distinguishing reported family history, documented conditions and predispositions.

Records retain IDs, document references, dates, units, confidence and clinical certainty where stored. Observations exclude drafts and rejected items. Other categories read clinical tables, never extraction drafts. Each profile/category has a separate `nextOffset`; follow it with `hearth_get_health_records` until null. Default pages are 50 records (25 for family history), maximum 100. Ordering is stable by record ID, not chronological; clients must use the dates when assessing trends. Pagination is not a snapshot if records change between requests.

Every requested profile must be accessible to the authenticated user. The entire selection is authorized before clinical records are read. No access is inferred from a family label. Relationships are relative to a profile's owner, and shared profiles are explicitly labeled accordingly. Hearth does not currently store a verified biological pedigree: confirm which people are blood relatives before interpreting inherited risk. Missing evidence is not negative family history.

Example question:

> Use Hearth to find my profile and my parents' profiles. Review our documented diagnoses and relevant reports for family history of diabetes. Keep each person's evidence separate, distinguish diagnoses from genetic risks, cite document IDs, and tell me where evidence or biological relationships are uncertain.

## Claude Desktop / local stdio

The existing `pnpm --silent mcp:hearth` command now includes the read tools alongside ingestion. It uses `HEARTH_API_TOKEN` and the existing database configuration. See [local ingestion configuration](mcp-prescription-ingest.md). Use an absolute executable path when your desktop client's PATH does not include pnpm. Keep environment loading rooted in the Hearth project directory.

## Remote HTTP clients

`https://YOUR_HEARTH_HOST/api/mcp` implements stateless MCP Streamable HTTP. The remote endpoint exposes **only the three read tools**, with read-only annotations; local filesystem and ingestion tools remain in stdio. Every request is authenticated independently. Responses are not cached. Host the Next.js app behind HTTPS and set `HEARTH_APP_URL` to its canonical origin.

Clients supporting custom headers can send `Authorization: Bearer hearth_...` using an existing Hearth API token. Do not put tokens in URLs. Invalid credentials return 401, not a browser login redirect.

### ChatGPT and OAuth-enabled remote clients

ChatGPT's authenticated MCP integration uses OAuth discovery and an authorization server. Hearth implements the resource-server side and validates tokens through an external OAuth provider's authenticated introspection endpoint. It does not implement its own login/consent/token service. See [OpenAI's authentication requirements](https://developers.openai.com/plugins/build/auth).

Configure a provider supporting authorization code with PKCE S256, metadata discovery, the client's redirect URI, resource/audience binding, and the `hearth:read` scope. Use dynamic client registration or register the ChatGPT/Claude client manually in that provider. Configure provider login and consent to describe the accessible health data. Refresh-token/offline access policy belongs to the provider.

Set these **server-side** variables:

```dotenv
HEARTH_APP_URL=https://hearth.example
HEARTH_MCP_OAUTH_ISSUER=https://identity.example
HEARTH_MCP_OAUTH_INTROSPECTION_URL=https://identity.example/oauth/introspect
HEARTH_MCP_OAUTH_CLIENT_ID=hearth-resource-server
HEARTH_MCP_OAUTH_CLIENT_SECRET=your-introspection-client-secret
HEARTH_MCP_OAUTH_SUBJECTS={"provider-subject":"existing-hearth-user-uuid"}
```

The introspection credentials use `client_secret_basic`. The provider must return `active`, `sub`, `aud`, `scope`, and `exp`; optional `iss` and `nbf` are checked when present. Tokens must be active, unexpired, carry `hearth:read`, and include the exact `HEARTH_APP_URL/api/mcp` audience. Only explicitly mapped subjects can access existing Hearth users. No email-based automatic linking or token passthrough is performed. Do not map several people to one account unless they should have identical profile access. Local Hearth tokens retain existing account-level access and can be rotated through Hearth.

Discovery is served at `/.well-known/oauth-protected-resource/api/mcp` and advertised in the unauthenticated endpoint's `WWW-Authenticate` header. In the client's MCP connection settings, enter the HTTPS endpoint and choose OAuth, then authenticate with the configured provider. If the provider requires manually registered client credentials, supply those in the client setup (these are distinct from Hearth's introspection credentials).

Without the provider configuration, direct bearer-token clients and local stdio work; the OAuth browser connection is not ready. Deployment and a real ChatGPT/Claude account-linking session must be verified in your environment. No public deployment or external account connection is performed by this code change.

## Validation

Tests exercise MCP initialization, discovery and calls using SDK transports, HTTP authentication/origin handling, all-or-nothing profile authorization, pagination, relationship semantics and OAuth claim validation. They use synthetic data, not production health records.
