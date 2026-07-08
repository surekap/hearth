# Dashboard drill-down redesign — design spec

**Date:** 2026-07-08
**Status:** Approved (approach A, labs folded into drill-down)

## Problem

The dashboard is a single long page with no real drill-down: metric cards are not
clickable, "drill into measurements" links are same-page anchors, and section caps
hide ~130 of the 183 metric types that have confirmed data. Dense wearable series
(HRV: ~8k points) and sparse lab series (ALT: a handful of points over years) are
rendered by the same downsampled sparkline. The pre-aggregated `health_rollups`
table (56k day/week/month rows) is never used by any chart. The "needs attention"
list mixes fresh abnormals with flags from 2018–2023. Events, meds, and genetics
are never shown in chart context. Labs is a disconnected alphabetical accordion.

## Goals

- Answer "I have a question about X" in ≤2 clicks: overview → system → metric.
- Every confirmed metric type reachable; nothing silently hidden by caps.
- Charts readable for both dense wearable data (rollup bands) and sparse lab data
  (real points only). No dummy/fabricated data anywhere.
- Cinematic look: existing body-system videos/images as full-bleed headers with
  glass overlay cards (per `ui-ideas/` references), teal/navy theme, Pip mascot
  empty states.
- Fold Labs into the drill-down; keep its browse/add/delete capabilities.

## Non-goals

- No changes to ingestion, extraction, review, meds, genetics, ask, export pages
  (they gain links only). No new data collection. No Nandita data backfill.
- No AI-generated insights on these pages (existing insights stay where they are).

## Information architecture

Three levels, all real routes (shareable URLs, back-button friendly):

### Level 0 — Overview `/dashboard`
A launcher readable in ~10 seconds:
1. **Attention strip** — recency-guarded flags (rule below), each links to its
   metric page. Stale abnormals collapse into one "N historical flags" link.
2. **Body-system gallery** — one card per system with data; video/image background
   where assets exist, gradient+icon otherwise; hero value + tone badge; links to
   `/dashboard/[system]`.
3. **All measurements** entry card (count of types) → `/metrics`.
4. **Recent events ribbon** — last ~8 markers (reports, med changes, documents).

Global range selector is removed from Level 0 (it applies per-chart at deeper
levels); overview always reflects latest state.

### Level 1 — System pages `/dashboard/[system]`
One page per body system, driven by a single **system registry** module
(`src/lib/health/systems.ts`) that maps system id → title, categories, key metric
names, media asset, genetics search terms, report specialty terms. Systems:
`cardiovascular`, `blood`, `kidney`, `metabolic`, `body-composition`, `bone`,
`sleep`, `activity`, `nutrition`, `respiratory`, plus report-only areas (dental,
eyes) which link to their documents. A system page renders only if data exists.

Contents (uncapped):
- Full-bleed media header (video where available) with glass overlay: title,
  hero value, tone badge, range selector for the page's charts.
- Key metric charts (the system's headline metrics, chart per metric, clickable).
- **Every** metric type in the system's categories as a linked list with latest
  value, interpretation badge, sparkline.
- Related clinical report summaries (matched by specialty terms) → documents.
- Related genetic risk assessments (matched by condition terms) → genetics page.
- Event markers relevant to range shown on charts (rule below).
- 404 → friendly Pip empty state if unknown system or no data.

### Level 2 — Metric detail `/metrics/[typeId]`
The workhorse page (new):
- Large chart, own range control (3m/6m/1y/3y/all), shaded reference band,
  event/medication markers on the x-axis.
- **Density rule:** if raw confirmed points in range > 120, read from
  `health_rollups` and render min–avg–max band; period auto-picked by range
  (3m→day, 6m/1y→week, 3y/all→month). Note: the rollups table currently
  contains only `day` rows (aggregations: `daily_avg`+`min`+`max`, or
  `daily_sum`), so week/month buckets are computed at query time with
  `date_trunc` over day rollups (count-weighted average for avg metrics, sum
  for sum metrics, min-of-min/max-of-max for the band). If a metric has no
  rollups at all, fall back to evenly downsampled raw points. Otherwise render
  every raw point as dot+line. A caption states exactly what is shown, e.g.
  "Weekly averages from 1,102 readings" or "All 7 recorded values".
- Single-point metrics: value card with reference range — no trend line ever.
- Stats row: latest, min/max in range, change vs. range start (only when ≥2 points).
- Full history table (all confirmed rows in range, newest first): value, unit,
  ref range, interpretation badge, source (document link when the observation
  came from a document; import/manual label otherwise).
- Manual add-value and delete actions (moved from Labs), same API endpoints.

### `/metrics` index (replaces `/labs`)
Searchable, category-grouped list of all metric types with confirmed data:
name, category, latest value + date, interpretation badge, point count. Each row
links to `/metrics/[typeId]`. Hosts the add-value dialog for new metric types.
`/labs` becomes a redirect to `/metrics`; nav item renamed Labs → Measurements
(same slot, FlaskConical icon may change to Ruler/ChartLine).

### Cross-cutting
- **⌘K metric search** (client component in the app shell): fuzzy match over
  metric type names + categories + system titles; Enter navigates.
- Dashboard cards, system lists, metric rows: everything clickable through to
  Level 2.

## Data layer

New module directory `src/lib/health/`:
- `systems.ts` — system registry (single source of truth; `buildSystemWidgets`
  config extracted here).
- `overview.ts` — `getOverviewData(profileId)`: latest-per-type only (SQL
  `DISTINCT ON`), attention rule, system hero values, recent markers. No raw
  series loads.
- `system.ts` — `getSystemData(profileId, systemId, range)`: metrics in the
  system's categories + key-metric series + reports + genetic assessments.
- `metric.ts` — `getMetricDetail(profileId, typeId, range)`: raw rows or rollups
  per density rule, markers, source document joins.
- `series.ts` — pure functions: density decision, rollup period selection,
  trend, recency guard. **Unit-tested (vitest).**

`src/lib/dashboard.ts` shrinks to what the overview still needs or is absorbed;
`getMetabolicLiverData` alias and the orphaned `/api/dashboard/metabolic-liver`
route are removed if nothing else consumes them.

### Attention/recency rule
Latest value of a type is **attention** if interpretation is `critical` (any age
≤ 24 months) or `high`/`low` observed within the last 18 months. Older abnormals
are **historical** (grouped link, still listed on their metric pages). Trend
alone (±5%) never triggers attention on Level 0 — it only badges cards at
Levels 1–2.

### Event markers on charts
Markers (document/report dates, medication start/stop/prescribed) within the
chart's range render as thin vertical rules with icon tooltip. Cap at 20 per
chart, prioritizing medication events, then reports.

## Data integrity rules (enforced in `series.ts`, asserted in tests)

1. Only `status = 'confirmed'` observations render, always profile-scoped via
   the existing `requireProfile` pattern.
2. Never interpolate or fabricate points; bands come only from real rollup rows.
3. Aggregated charts must carry the caption stating aggregation + source count.
4. A metric with one point renders no trend/line.
5. Every chart value traceable: history table shows the underlying rows.

## Visual design

- Glass cards over media, as in `ui-ideas/`: backdrop-blur panels, generous
  radius, existing teal/navy tokens (`--primary`, `--warning`, `--success`),
  Badge chip + `text-3xl` h1 header pattern, Pip `EmptyState` for empty systems
  and profiles (Nandita has no data yet — must look inviting, not broken).
- Existing assets reused: `public/images/{heart-circulatory,kidney-urinary,
  sleep-recovery}.{png,mp4}`, `liver-metabolism.png`, `body-composition.png`.
  Videos: `autoPlay muted loop playsInline poster` with reduced-motion fallback
  to poster image. Systems without media get the gradient+icon treatment.
- Recharts throughout (already a dependency): line+dot for sparse, area band
  (min–max) + avg line for dense, `ReferenceArea` for reference band.
- Mobile: system gallery becomes vertical stack; charts min-height 220px;
  bottom-nav pattern preserved.

## Testing

- Add `vitest` (dev-dep) for `src/lib/health/series.ts` and the attention rule:
  density thresholds, rollup period fallback, recency guard boundaries,
  single-point behavior.
- Manual verification via preview: overview → cardiovascular → HRV (dense,
  rollups); overview → attention CRP → metric page (sparse, markers show June
  2026 discharge); /labs redirect; ⌘K jump; mobile viewport; dark mode.

## Rollout / order

1. `src/lib/health/` data layer + vitest setup (foundation).
2. `/metrics/[typeId]` + `/metrics` index; `/labs` → redirect; nav rename.
3. `/dashboard/[system]` pages with media headers.
4. Slim `/dashboard` overview to launcher; attention recency guard live.
5. ⌘K search + cross-links + chart event markers; remove dead code
   (`metabolic-liver` route, labs view) after replacements verified.
