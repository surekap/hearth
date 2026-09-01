# Coding standards

This documents the conventions this codebase actually follows (verified against
`src/`), so new code stays consistent rather than introducing a fourth pattern for
something that already has three consistent ones. See [ARCHITECTURE.md](./ARCHITECTURE.md)
for how the pieces fit together, and [AGENTS.md](./AGENTS.md) — **read that one
first** — for the pinned pre-release Next.js API differences.

## TypeScript

- `strict: true`. There is essentially no use of `any` and no `@ts-ignore` /
  `@ts-expect-error` anywhere in `src/` — keep it that way. If a type doesn't fit,
  fix the type, don't escape-hatch it.
- Path alias `@/*` → `src/*`.
- Validate everything crossing a trust boundary (API body, form data, extraction
  model output) with `zod`. This is used pervasively and consistently — don't
  hand-roll validation.

## Exports

- **Named exports everywhere in `src/lib/` and `src/components/`.** Default exports
  appear only where Next.js requires them: `page.tsx`, `layout.tsx`, route
  component files.

## Server Actions vs. API routes

The codebase splits these by **who calls it**, not by feature area — follow the same
rule rather than picking one pattern globally:

- **Server Actions** (`"use server"`, `src/app/actions/*.ts`) for mutations owned by
  a server-rendered form (`<form action={...}>`) — e.g. profile CRUD, token rotation.
  Auth failure inside an action redirects to `/login` via a local `requireUserId()`
  helper (distinct from the API routes' `requireUser()` — see below).
- **API routes** (`src/app/api/**/route.ts`) for anything a **client component**
  calls via `fetch()` — uploads with progress/queue state, optimistic-UI medication
  logging, extraction review actions.

Don't add a second path (action + route, or two routes) for the same mutation. One
existed before this audit: `PATCH /api/profiles/[id]` has no caller anywhere in the
app — `updateProfile` (the Server Action) is what the Profiles page actually uses.
Treat the unused route as a signal to check for callers before assuming a route or
action is live, and see the [cruft findings](#known-cruft) below.

## Error handling

Every API route follows one shape — copy it rather than inventing a variant:

```ts
export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    await requireProfile(userId, profileId);
    const body = someSchema.parse(await req.json());
    // ...
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues }, { status: 400 });
    }
    return handleApiError(e);
  }
}
```

`ApiError` (`src/lib/api.ts`) is the only custom error class in the codebase —
`throw new ApiError(status, message)` deep in a call and let it bubble to
`handleApiError`, which logs unexpected (non-`ApiError`) errors via `console.error`
and returns a generic 500. Don't introduce a second error-class hierarchy.

## Auth & profile scoping

- API routes: `const { userId } = await requireUser()` then
  `await requireProfile(userId, profileId)` before touching any clinical table.
  Use `requireProfileManager` instead when the operation manages account access
  (inviting/removing shared users), not just reading/writing clinical data.
- Server Actions: `requireUserId()` (redirects rather than throwing).
- **Every query against `documents`, `observations`, `clinical_reports`,
  `medication_events`, `genetic_*`, etc. must filter by `profile_id`.** There is no
  legitimate reason to query these by `user_id` alone — if you find yourself doing
  that, you've broken profile isolation. This is the one rule in the codebase with
  zero tolerance for exceptions.

## Comments

Sparse, and only for the *why*, not the *what* — matches the rest of this repo's
style. Examples worth imitating:

- `src/lib/health/series.ts`: *"Pure series logic ... No DB access here — everything
  is unit-testable."*
- `src/lib/api.ts`: *"Profile isolation: every clinical query must be scoped..."*
- `src/lib/extraction/index.ts`: marks `processDocument()` explicitly as a
  compatibility wrapper, not the recommended path.

Don't add comments that restate the code, and don't leave TODO/FIXME markers as a
substitute for either doing the thing or filing it somewhere durable — there are
currently none in `src/`, which is the standard to hold.

## Logging

`console.log` / `console.error` are used deliberately in two places: structured
operational logging in the extraction queue (`src/lib/extraction/index.ts`) and the
audit-log failure fallback in `src/lib/api.ts` (*"Audit failures must never break the
main flow"*). Don't add ad-hoc debug `console.log`s outside those patterns, and never
commit a `debugger` statement.

## Testing

Vitest, and the project has a clear, deliberate split — **pure/deterministic logic
is unit-tested; DB-touching loaders, API route handlers, Server Actions, and React
components are not**:

- Tested: `src/lib/health/{series,normalization,markers*,systems,clinical-imports}`,
  `src/lib/extraction/*` (including a mocked-OpenAI test for `openai.ts`),
  `src/lib/health-bridge/{config,daily,samples}`, `src/lib/ai/{conversations,models}`,
  `src/lib/{storage,medication-course}`, `src/proxy.ts`.
- Not tested (by design, not by omission): `app/api/**/route.ts`, Server Actions,
  any component/page, the DB-querying loaders in `lib/health/{metric,system,overview}`,
  `lib/export/*`, `lib/mcp/ingest.ts`, `lib/ai/{answer,context,insights,datapoints,
  rules,redact,snippets}`, `lib/crypto.ts`, `lib/auth.ts`.

When a file mixes pure logic with DB/network calls, the established pattern is to
**split it** (e.g. `markers.ts` DB loader vs. `marker-utils.ts` pure shaping,
`series.ts` kept entirely DB-free) so the pure part stays testable rather than adding
integration-test infrastructure. Prefer that split over either skipping tests or
mocking the DB.

Run tests with:

```bash
npm run test
```

## Database schema changes

The project uses `drizzle-kit push` (`npm run db:push`), not generated migrations —
there's no `/drizzle` migration history in the repo. For an additive/safe schema
change, edit `src/db/schema.ts` and rely on `db:push` (it also runs automatically on
every container start via `docker/start.sh`). For a change `push` can't express
safely — backfills, data transforms, anything with an ordering requirement — add a
hand-written, idempotent SQL script under `scripts/migrations/` and apply it manually
rather than fighting `push` into doing something it isn't designed for. Don't mix the
two for the same change.

`drizzle.config.ts` explicitly excludes `health_daily` / `health_samples` from the
Drizzle-managed table set (`tablesFilter`) — those schemas belong to Health Bridge,
not Hearth. Never add them as Drizzle-managed tables or make them rename/drop
candidates.

## Naming & shared enums

Document type, document source, and MIME-allowlist values currently exist in three
places that must be kept in sync by hand: `src/app/api/documents/upload/route.ts`,
`src/lib/mcp/ingest.ts`, and the `<select>` options in
`src/app/(app)/upload/upload-form.tsx`. Until these are consolidated (see cruft
findings), **changing one of these lists means changing all three** — grep for the
enum values before assuming an edit in one file is complete.

## Package manager

**Use `npm`**, matching `package-lock.json`, `Dockerfile` (`npm ci`), and every
script in `package.json`/`README.md`. Don't run `pnpm install` in this repo — see
[cruft findings](#known-cruft) for why stray `pnpm-lock.yaml` / `pnpm-workspace.yaml`
files showed up and why they don't belong.

## Known cruft

See the cleanup section of the current work — summarized here so it doesn't get
re-discovered from scratch:

1. ~~**Mixed package managers**~~ — `pnpm-lock.yaml` and a `pnpm-workspace.yaml`
   containing only unfilled placeholder text (`esbuild: set this to true or false`)
   had been committed alongside the real `package-lock.json`. The project is
   npm-only everywhere else (Dockerfile, scripts, docs). **Removed** during this
   audit.
2. ~~**Six unused shadcn primitives**~~ — `src/components/ui/{alert,select,separator,
   skeleton,sonner,tabs}.tsx` had zero importers anywhere in the app. **Removed**
   during this audit; re-add via `npx shadcn add <name>` if a future feature needs
   one.
3. ~~**Dead API route**~~ — `PATCH /api/profiles/[id]` had no caller; `updateProfile`
   (Server Action) is what's actually wired to the UI. **Removed** during this audit.
4. ~~**Diagnoses had no destination**~~ — `diagnosis` was in `extracted_item_type`
   but had no extraction field, no accept branch and no table, and the accept loop
   marked unhandled types `accepted` while writing them nowhere. **Fixed**: added a
   `diagnoses` table, extraction schema + prompt coverage, an accept branch, and an
   upfront `ACCEPTABLE_ITEM_TYPES` guard so no type can ever be silently dropped.
   `procedure` remains unhandled and is now explicitly rejected rather than lost.
5. **Orphaned compatibility wrapper** — `processDocument()` in
   `src/lib/extraction/index.ts` has no remaining callers in the repo. It's already
   self-documented as legacy (*"New uploads should call queueDocumentExtraction..."*).
   Left in place since `extraction/index.ts` had substantial changes in flight at the
   time of this audit — confirm it's still unused before deleting.
6. **Triplicated enum/MIME logic** — see [Naming & shared enums](#naming--shared-enums)
   above; worth deriving all three call sites from `src/db/schema.ts`'s enums instead.
