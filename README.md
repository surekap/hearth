# Hearth — Family Health Record PWA

Private, family-oriented health records: upload medical PDFs/images per family profile,
extract lab values with an LLM into reviewable drafts, confirm them into a structured
Postgres model, and explore trends, timelines and profile-scoped AI Q&A.

Built from [SPEC.md](./SPEC.md) — Phase 1, Milestones 1–5 (the "first successful prototype"
flow: upload → extract → review → confirm → timeline → dashboard → AI Q&A).

## Stack

- **Next.js 16** (App Router, Turbopack) · TypeScript · Tailwind 4 · shadcn/ui · Recharts
- **Postgres** via Drizzle ORM (`pg` Pool — works with local Postgres and Neon)
- **Auth.js v5** credentials (email/password, JWT sessions), route protection via `src/proxy.ts`
- **Documents**: AES-256-GCM encrypted before storage; Vercel Blob when
  `BLOB_READ_WRITE_TOKEN` is set, local `./storage` dir otherwise
- **Extraction**: OpenAI Responses API (PDF/image input, strict JSON schema) when
  `OPENAI_API_KEY` is set; deterministic **mock provider** otherwise so the whole flow
  works offline
- **AI Q&A**: profile-isolated context builder → PII redaction (v1) → LLM →
  `ai_context_logs` records the exact context packet the model saw

## Local development

Prereqs: Node 20+, Postgres running locally.

```bash
npm install

# .env.local was generated with dev secrets; adjust DATABASE_URL if needed
npm run db:push     # create tables
npm run db:seed     # observation types + user (surekap@gmail.com / hearth-dev)

npm run dev         # http://localhost:3000
```

Sign in with the seeded account (`SEED_USER_EMAIL` / `SEED_USER_PASSWORD` in `.env.local`,
default `surekap@gmail.com` / `hearth-dev`).

A sample Apollo-style lab PDF lives at `fixtures/apollo-sample-lab-report.pdf` for testing
the upload flow.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (local or Neon) |
| `AUTH_SECRET` | Auth.js JWT secret (`openssl rand -base64 32`) |
| `DOCUMENT_ENCRYPTION_KEY` | 32-byte hex master key for AES-256-GCM (`openssl rand -hex 32`) |
| `OPENAI_API_KEY` | Enables real extraction + AI Q&A (otherwise mock provider) |
| `OPENAI_MODEL` | Optional, defaults to `gpt-4o` |
| `BLOB_READ_WRITE_TOKEN` | Enables Vercel Blob storage (otherwise local `./storage`) |
| `EXTRACTION_PROVIDER` | Set to `mock` to force the mock provider even with a key |
| `SEED_USER_EMAIL/PASSWORD/NAME` | Seed account, used by `npm run db:seed` |

## Deploying to Vercel

1. Create a Vercel project and link this repo (`vercel link`).
2. Provision **Neon Postgres** and **Vercel Blob** from the Vercel Marketplace/Storage tab —
   this injects `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN`.
3. Add `AUTH_SECRET`, `DOCUMENT_ENCRYPTION_KEY`, `OPENAI_API_KEY` as env vars.
4. Run the schema push + seed once against the Neon URL:
   `DATABASE_URL=postgres://…neon… npm run db:push && DATABASE_URL=… npm run db:seed`
5. `vercel deploy --prod`.

Keep `DOCUMENT_ENCRYPTION_KEY` safe — encrypted documents are unreadable without it.

## Architecture notes

- **Profile isolation is non-negotiable**: every clinical query filters by `profile_id`,
  every API route calls `requireProfile(userId, profileId)`, and the AI context builder
  selects data *before* anything reaches the model. Verified: a second profile sees zero
  of the first profile's data.
- **Drafts are never trusted**: extraction produces `extracted_items` (drafts). Confirmed
  `observations` rows are only written when the user accepts rows on the review screen.
  Dashboards and AI Q&A read `status = 'confirmed'` only.
- **Storage never sees plaintext**: files are AES-256-GCM encrypted server-side before
  `putObject`; the only decryption path is the authenticated
  `/api/documents/:id/file` endpoint (which audit-logs each view).
- **Audit trail**: uploads, views, extractions, accepts/rejects and AI questions land in
  `audit_logs`; the exact AI context packet + redaction version lands in `ai_context_logs`.

## Key directories

```
src/db/            schema (users, profiles, documents, extraction_jobs,
                   extracted_items, observations, observation_types,
                   clinical_reports, ai_context_logs, audit_logs), seed
src/lib/           auth, crypto (AES-GCM), storage (Blob/disk), dashboard
src/lib/extraction openai + mock providers, canonical test mapping
src/lib/ai/        context builder, PII redaction, answer providers
src/app/api/       upload, process, review accept/reject, observations,
                   dashboard, ai/ask, profiles
src/app/(app)/     timeline, dashboard, labs, documents, review, upload,
                   ask, profiles
```

## Roadmap (from SPEC.md)

- **Milestone 6**: medication logging (prescription→loggable meds, quick log, recents)
- **Milestone 7**: JSON / FHIR-inspired / doctor-friendly PDF export
- **Phase 1.5**: iOS Shortcut upload API (token-authenticated endpoint)
- **Phase 2**: native iOS shell with Share Extension + HealthKit sync
