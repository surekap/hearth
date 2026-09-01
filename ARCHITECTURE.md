# Architecture

Hearth is a self-hosted Next.js 16 (App Router) app that turns uploaded medical
documents into a structured, profile-isolated health record, with an OpenAI-backed
extraction/Q&A layer that never touches unreviewed data. This document describes how
the pieces fit together. For the product spec and full data-model rationale, see
[SPEC.md](./SPEC.md). For running it in production, see [DEPLOYMENT.md](./DEPLOYMENT.md).

> This repo pins a pre-release Next.js whose APIs differ from what most training data
> assumes (e.g. `middleware.ts` is `src/proxy.ts`, route `params`/`searchParams` are
> `Promise`s). See [AGENTS.md](./AGENTS.md) before assuming a Next.js API works the
> way you remember — check `node_modules/next/dist/docs/` first.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict) |
| Styling | Tailwind CSS 4, shadcn/ui (Radix primitives), Recharts |
| Database | Postgres via Drizzle ORM, raw `pg` `Pool` (works local, self-hosted, or managed) |
| Auth | Auth.js v5, credentials provider, JWT sessions |
| Storage | AES-256-GCM encrypted files on a durable host filesystem (`./storage` dev, bind mount in prod) |
| Extraction | OpenAI Responses API (strict JSON schema) with a deterministic mock provider fallback |
| Testing | Vitest, unit-level only (see [CODING_STANDARDS.md](./CODING_STANDARDS.md)) |
| Deployment | Docker Compose on a single Hetzner host, `nginx-proxy` + ACME for TLS |

## Request flow: upload → confirmed record

```
PWA file picker / iOS Shortcut
  → POST /api/documents/upload            (session OR bearer-token auth)
      MIME/size validation, sha256 de-dup, AES-256-GCM encrypt, store on disk
      insert documents row + extraction_jobs row (status: pending)
      schedule background queue drain, respond immediately
  → drainExtractionQueue()                (src/lib/extraction/index.ts)
      claims pending jobs, calls the extraction provider (OpenAI or mock)
      writes extracted_items rows (status: draft) — never touches observations
  → GET /documents/:id/review              user reviews draft rows against the source PDF
  → POST /api/extractions/:id/accept       confirmed rows written to
                                            observations / clinical_reports / medication_events /
                                            genetic_* tables (status: confirmed)
  → dashboards, timeline, AI context, export all read status = 'confirmed' only
```

`extraction_jobs` is a durable queue table, not a fire-and-forget call: `pending` →
`processing` → `needs_review` / `failed`. `POST /api/extractions/drain` exists as a
cron-triggered recovery endpoint (bearer-auth via `CRON_SECRET`) for jobs that never
got picked up after an upload. Manual "retry extraction" from the UI re-enters the
same queue path.

**Drafts are never trusted.** Nothing outside the review screen reads
`extracted_items`; nothing outside `accept`/`reject` writes to it. This split is the
single most important invariant in the codebase.

Every accepted item type must have a write branch in the accept route. The route
validates this upfront (`ACCEPTABLE_ITEM_TYPES`) and rejects the whole batch if an
item has no destination — otherwise an unhandled type would be marked `accepted`
and written nowhere, losing data behind a success message.

## Profile isolation

Every family member is a `profiles` row scoped to a `users` row (with optional shared
access via `profile_accounts`, manager/member roles). This is treated as a hard
security boundary, not a UI convenience:

- Every API route calls `requireUser()` then `requireProfile(userId, profileId)`
  (or `requireProfileManager` for account-management operations) before any query —
  see `src/lib/api.ts`.
- Every clinical query filters by `profile_id`. There is no code path that queries
  `observations`, `documents`, etc. by `user_id` alone.
- The AI context builder (`src/lib/ai/context.ts`) selects data scoped to one profile
  *before* anything is sent to the model — profile mixing is not a redaction-layer
  concern, it's structurally impossible.
- The active profile for page-level reads comes from `getActiveProfile()`
  (`src/lib/active-profile.ts`), backed by the `hearth_active_profile` cookie, falling
  back to the user's first profile.

## Storage & encryption

Documents and generated clinical-image derivatives are AES-256-GCM encrypted
server-side (`src/lib/crypto.ts`) before `putObject` (`src/lib/storage.ts`). The only
decryption path is the authenticated `/api/documents/:id/file` (and
`/api/clinical-images/:id/file`) route, which audit-logs each view. Plaintext exists
only transiently — e.g. Poppler renders clinical-image pages into a short-lived
`/tmp` directory inside the container (see `Dockerfile`).

`DOCUMENT_ENCRYPTION_KEY` is the single master key for all encrypted content. Losing
it makes every stored document unreadable — see the backup guidance in
[DEPLOYMENT.md](./DEPLOYMENT.md).

## AI layer

`src/lib/ai/` builds a profile-scoped `AiContext` packet (`context.ts`), redacts PII
(`redact.ts`), and answers through three tiers, cheapest first:

1. **Rules engine** (`rules.ts`) — trend/latest/abnormal questions computed directly
   from confirmed observations, no model call.
2. **Reasoning model** (`answer.ts`) — a fixed `DOCTOR_PERSONA` system prompt that is
   explicitly constrained (no prescribing, no diagnosing, no cross-profile data),
   with keyword-matched raw-report snippets (`snippets.ts`) added when structured
   data may not cover the question.
3. **Pre-computed insights** (`insights.ts`, `insight-presenter.ts`) — a
   fingerprinted briefing regenerated only when the underlying data changes
   (`scheduleInsightRefresh`), always visible on the Ask tab.

Patient-reported details mentioned in conversation (symptoms, mood, sleep) are mined
into `conversation_datapoints` (`datapoints.ts`) and fed back into future context.
Every question, the exact context packet sent to the model, and the redaction version
are logged to `ai_context_logs` — this is the only way to audit what the model
actually saw. Models are selected per task via `EXTRACTION_MODEL` /
`REASONING_MODEL` (`models.ts`), both defaulting to `OPENAI_MODEL`.

## Health data layer

`src/lib/health/` is split deliberately into pure logic and DB-querying loaders:

- **Pure, DB-free logic** — `series.ts` (downsampling/rollups/trend math),
  `normalization.ts` (unit normalization, implausible-value filtering),
  `marker-utils.ts` (timeline marker shaping). These are the only files in the
  directory with meaningful unit-test coverage, by design.
- **DB loaders** — `metric.ts` (per-metric series), `system.ts` (per-body-system
  drill-down), `overview.ts` (dashboard overview), `markers.ts` (queries backing
  `marker-utils.ts`), `clinical-imports.ts` (grouped import batches for the
  timeline). These compose the pure logic above with Drizzle queries; they look
  similar to each other because they share a layering pattern (registry → loader →
  pure math), not because of duplication.
- **`systems.ts`** is the single source of truth mapping observation categories and
  canonical metric names to body systems (cardiovascular, kidney, liver, etc.) —
  everything else in the directory reads from this registry rather than hardcoding
  category lists.

Dense wearable data never reaches dashboards or AI context directly — it's
aggregated into `health_rollups` (day/week/month) first.

## Health Bridge integration

Each profile can be connected to Apple Health / Health Connect via **Health Bridge**,
an external sync client that writes into a **profile-private Postgres schema**
(`src/lib/health-bridge/provision.ts` provisions a dedicated schema + role per
profile). Hearth pulls from that schema (`sync.ts`) into its own `health_imports`,
`observations`, and `health_events` tables — Health Bridge tables themselves
(`health_daily`, `health_samples`) are intentionally excluded from Drizzle's own
migration surface (see `tablesFilter` in `drizzle.config.ts`) since Health Bridge
owns their schema, not Hearth.

## MCP prescription ingest

`scripts/hearth-mcp.ts` runs a standalone stdio MCP server (`npm run mcp:hearth`) for
bulk-ingesting a local folder of old prescription PDFs/scans outside the browser
upload flow. It shares upload/extraction semantics with the HTTP API via
`src/lib/mcp/ingest.ts`, authenticating with the same bearer-token mechanism as the
iOS Shortcut path (`users.api_token`). See
[docs/mcp-prescription-ingest.md](./docs/mcp-prescription-ingest.md).

## Export

`src/lib/export/` composes one profile-scoped bundle (`data.ts`) into three formats,
all confirmed-data-only and audit-logged: doctor-friendly PDF (`pdf.ts`, `pdf-lib`),
internal JSON, and a FHIR-inspired bundle (`fhir.ts` — Patient / Observation /
DiagnosticReport / DocumentReference / MedicationStatement; not a fully conformant
FHIR server, deliberately scoped to "good enough to hand a doctor or another system").

## Directory layout

```
src/app/(app)/       Protected pages (auth + active-profile resolved once in layout.tsx)
                      timeline (/), dashboard, metrics, ask, images, meds, genetics,
                      documents, upload, export, profiles
src/app/api/          Route handlers for anything called from a client component
src/app/actions/      Server Actions for server-rendered form mutations
                      (profiles.ts, api-token.ts)
src/app/login|signup| Unauthenticated routes outside the (app) shell
  offline/
src/components/ui/    shadcn/Radix primitives, customized (spring easing, oklch
                      hover states) — not stock boilerplate
src/components/health/ Chart components (metric-chart, sparkline)
src/components/shell/  App chrome (nav, command menu, profile switcher, PWA bits)
src/db/                schema.ts (29 tables, 24 enums), seed.ts, seed-data.ts
src/lib/                auth, crypto, filesystem storage, profile access control
src/lib/ai/             context builder, redaction, rules engine, answer providers,
                        insights, conversation memory
src/lib/extraction/     OpenAI + mock providers, canonical name mapping, Zod schemas,
                        queue orchestration (index.ts)
src/lib/health/         series math, system/metric/overview loaders, systems registry
src/lib/health-bridge/  Apple Health / Health Connect bridge sync + provisioning
src/lib/export/         profile bundle loader, PDF/FHIR/JSON builders
src/lib/mcp/            shared logic for the standalone MCP ingest server
scripts/                one-off/maintenance scripts + hearth-mcp.ts entrypoint +
                        SQL migrations applied ad hoc alongside `drizzle-kit push`
```

## Schema-change workflow

There is no `drizzle-kit generate` migration history checked in (no `/drizzle`
output directory) — the app applies schema state directly with
`drizzle-kit push` (`npm run db:push`, also run on every container start via
`docker/start.sh`). `scripts/migrations/*.sql` holds a small number of hand-written,
manually-applied SQL scripts for changes `db:push` can't express safely (e.g.
backfills). Know which of the two a given schema change needs before making it —
see [CODING_STANDARDS.md](./CODING_STANDARDS.md#database-schema-changes).

## Auth & routing

`src/proxy.ts` (this Next.js version's name for middleware) wraps `NextAuth` and
gates every route except a small allowlist (`api/auth`, the upload endpoint —
bypassed so large multipart bodies aren't buffered/truncated — static assets, PWA
files). Session checks inside pages/actions redirect to `/login`; API routes throw
`ApiError(401)` instead, caught by a uniform `handleApiError` — see
[CODING_STANDARDS.md](./CODING_STANDARDS.md) for the full error-handling convention.
