# MontréalScore — CLAUDE.md

## Rules

### Destructive Commands
- **Always confirm before running `rm`, `rm -rf`, or any delete/overwrite operation.** No exceptions.

### Git Workflow
- **All new features must be preceded and terminated with a git commit.** Commit before starting work (snapshot) and after completing it.
- Never push to remote without user approval.

### Dev-First Deployment
- Test all changes on `npm run dev` (port 3000) first.
- User must approve before deploying to production.
- **Always deploy using `scripts/deploy.sh`** — never manually restart the production server. The script handles: git pull, ETL, migrations, build, symlinks, systemd restart, and Cloudflare cache purge.
- **Never assume pages work just because HTTP 200 or `tsc --noEmit` passes.** Next.js streams RSC payloads — `curl` cannot verify rendered content. If you cannot visually confirm page content, **ask the user to check** before proceeding.

---

## Architecture

### Stack
- **Framework:** Next.js 16 (App Router, standalone output) + React 19 + TypeScript 5
- **Database:** SQLite via better-sqlite3 (readonly in app, WAL mode)
- **Styling:** Tailwind CSS v4 with CSS custom properties for theming
- **Charts:** Recharts v2
- **i18n:** next-intl v4 (French default, English)
- **ETL:** TypeScript scripts fetching from Montreal CKAN API
- **Production:** Node.js cluster (8 workers, port 3891) behind Cloudflare Tunnel
- **Live URL:** https://montrealscore.ashwater.ca

### Data Flow
```
Open Data API → ETL scripts → SQLite DB
                                   ↓
                            db.ts (queries, parameterized)
                                   ↓
                            data.ts (transforms, React cache())
                                   ↓
                            Server Components (SSR/ISR)
                                   ↓
                            Client Components (interactivity)
```

### Jurisdiction System (Multi-Government Support)

The app is genericized for multi-jurisdiction support. Montreal-specific constants are centralized in a config system rather than hardcoded throughout the codebase.

**Key principle:** Adding a new jurisdiction (Quebec provincial, Canadian federal) should require writing a config + ETL script, not restructuring the app.

#### `src/lib/jurisdiction.ts`
Central config per jurisdiction. Currently only Montreal. Contains:
- Brand name, domain, DB filename
- Admin periods (Coderre, Plante, Martinez Ferrada date ranges)
- Scoring params (`permitTargetDays`, `previousTargetDays`)
- Inauguration dates (for promise countdown)
- Intergovernmental supplier exclusion list
- Procurement threshold eras (Quebec law)
- Data source info, feature flags

Usage in page components:
```ts
const jx = getJurisdiction(); // defaults to "montreal"
const presets = buildPresets(jx.adminPeriods.permits, bounds.max);
```

#### `areas` Table (Hierarchical Geography)
```
Canada → Quebec → Montreal → 19 boroughs
```
- `areas` — immutable identity (slug, type, name_fr, name_en, parent_id)
- `area_attributes` — mutable data (population, area_km2) with effective dates
- `area_aliases` — dataset name normalization (e.g. "CDN-NDG" → Côte-des-Neiges-Notre-Dame-de-Grâce)

#### Adding a New Jurisdiction (Phase 2)
1. Add config to `JURISDICTIONS` map in `jurisdiction.ts`
2. Write ETL script for the new data source
3. Create migration to seed areas hierarchy
4. Add i18n strings to `Jurisdiction` namespace
5. URL routing (`[jurisdiction]` segment) and multi-domain are Phase 2 concerns

### Directory Structure
```
src/
├── app/[locale]/           # Pages: permits, contracts, 311, promises, about, volunteer
│   └── api/                # API routes (ETL trigger, promise CRUD)
├── components/             # Reusable components (server + client)
├── lib/
│   ├── jurisdiction.ts     # Jurisdiction config (brand, scoring, thresholds, etc.)
│   ├── db.ts               # Read-only SQLite queries (multi-DB, parameterized)
│   ├── db-write.ts         # Write-only DB handle (API routes only)
│   ├── data.ts             # Data transforms + React cache() wrappers
│   ├── types.ts            # All TypeScript interfaces and union types
│   ├── scoring.ts          # Borough grade calculation (A-F, parameterized target)
│   ├── boroughs.ts         # Area name normalization (DB-backed + hardcoded fallback)
│   ├── supplier-normalization.ts  # Supplier name canonicalization
│   └── api-auth.ts         # Bearer token auth + rate limiting
└── i18n/                   # next-intl routing, request config, navigation
scripts/
├── etl.ts                  # Permits + contracts ETL (CKAN SQL queries)
├── etl-311.ts              # 311 service requests ETL
├── seed-promises.ts        # Bulk import campaign promises
├── admin.ts                # Standalone admin UI (Express, port 3099)
├── deploy.sh               # Full deploy pipeline
└── migrations/             # Idempotent DB migrations (safe to re-run)
messages/
├── fr.json                 # French translations (ICU MessageFormat)
└── en.json                 # English translations
```

---

## Patterns & Conventions

### Jurisdiction Config Pattern
- **All jurisdiction-specific values** (domain, admin periods, scoring params, inauguration dates, intergovernmental suppliers, threshold eras) live in `jurisdiction.ts`.
- **Page components** call `getJurisdiction()` at the top and use `jx.domain`, `jx.adminPeriods`, etc.
- **Metadata URLs** are built from `jx.domain`, never hardcoded.
- **buildPresets()** converts admin periods (with nullable `to`) into DateRangeSelector presets.

### Component Pattern
- **Server components by default.** Only add `"use client"` when the component needs hooks, event handlers, or browser APIs.
- **Server components** fetch data and pass it as props to client components.
- **Client components** handle interactivity: charts (Recharts), filters, date selectors, locale switcher.
- **Naming:** PascalCase files and exports (`PermitBarChart.tsx`, `StatusBadge.tsx`).

### Data Layer Pattern
- **db.ts** — Raw SQL queries. Multi-DB support (cached by jurisdiction slug). All use parameterized prepared statements. Never interpolate user input. Functions prefixed with `query*`.
- **data.ts** — Business logic transforms. All wrapped with `React.cache()` for per-request deduplication. Functions prefixed with `get*`.
- **db-write.ts** — Separate write-only handle, used only in API routes behind auth.
- **Database is readonly in app code.** Writes happen only through authenticated API routes.
- **Area queries** — `queryAreas(type?)`, `queryAreaBySlug(slug)`, `resolveAreaAlias(raw)` in db.ts; wrapper functions with hardcoded fallbacks in boroughs.ts.

### Type Conventions
- **Raw types** (from DB): prefixed with `Raw` (e.g., `RawPermit`, `RawContract`, `RawPromise`)
- **Processed types** (for components): plain name (e.g., `Permit`, `CampaignPromise`, `ContractStats`)
- **Union types:** `PromiseStatus`, `PromiseSentiment`, `PromiseCategory`, `Grade`
- **Column naming:** snake_case, ISO 8601 dates as TEXT (`YYYY-MM-DD`)

### i18n Pattern
- **Default locale:** French (`fr`). Locale always in URL (`/fr/permits`, `/en/permits`).
- **Server components:** `const t = await getTranslations("PageNamespace");` then `t("key")`.
- **Client components:** `const t = useTranslations("Namespace");` (requires `"use client"`).
- **When passing translations to client components:** resolve them in the server parent and pass as string props in a `labels` object. This avoids needing `useTranslations` in the client.
- **Plurals:** Use ICU MessageFormat in messages JSON (e.g., `"{count, plural, one {# item} other {# items}}"`).
- **Navigation:** Use `Link` from `@/i18n/navigation`, not `next/link`.
- **Jurisdiction namespace:** `t("Jurisdiction.name")`, `t("Jurisdiction.areaLabel")`, etc. for jurisdiction-specific labels.

### Styling Pattern
- **Tailwind v4** with `@theme inline` in `globals.css` mapping CSS custom properties.
- **Theme tokens:** `text-muted`, `text-accent`, `text-foreground`, `bg-card-bg`, `bg-background`, `border-card-border`.
- **Grade colors:** `text-grade-a` through `text-grade-f`, `bg-grade-a` through `bg-grade-f`.
- **Dark mode:** Automatic via `prefers-color-scheme: dark` (CSS variables swap).
- **Common layouts:** `max-w-4xl mx-auto px-4 py-8` for page containers.
- **Cards:** `border border-card-border rounded-xl p-4 bg-card-bg` (or `p-6`).

### API Route Pattern
- All routes use `withAuth()` wrapper from `api-auth.ts`.
- Auth: Bearer token via `Authorization` header, compared with `timingSafeEqual`.
- Rate limiting: 30 req/min per IP (ETL: 1 per 60s).
- Input validation before any DB write.
- `source_url` validated to require `http://` or `https://` prefix.

### ETL Pattern
- CKAN SQL API at `https://donnees.montreal.ca/api/3/action/datastore_search_sql`.
- Rate limit: 3s+ delay between queries (Cloudflare enforced).
- Exponential backoff on 429/5xx errors.
- 5 contract datasets (fonctionnaires, conseil_municipal, conseil_agglomeration, comite_executif, conseils_arrondissement) — each has different column names.
- Intergovernmental suppliers (from `jurisdiction.ts` config) excluded from analysis.
- Post-ETL migrations: `add-processing-days.js`, `build-fts.js`, `cache-permit-trends.js`, `create-areas.js`.

### Revalidation Strategy
- SSG pages use `export const revalidate = 3600` (1-hour ISR).
- Admin API calls `revalidatePath()` to bust cache after promise updates.
- Cloudflare cache purged on deploy via API.

---

## Common Commands

```bash
npm run dev              # Dev server (Turbopack, port 3000)
npm run build            # Production build
npm run etl              # Incremental ETL (current + previous year)
npm run etl:full         # Full ETL (all years from 2000)
npm run etl:311          # 311 incremental ETL
npm run etl:311:full     # 311 full ETL
npm run promises:seed    # Bulk import promises
npm run admin            # Admin UI (Express, port 3099)
npx tsc --noEmit         # Type-check without building
scripts/deploy.sh        # Full production deploy
```

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `permits` | Raw permit applications (457K+ rows) |
| `contracts` | Procurement contracts (312K+ rows) |
| `promises` | Campaign promises (420 rows) |
| `promise_updates` | Progress updates on promises |
| `etl_runs` | ETL execution log |
| `sr_monthly` | 311 monthly request volumes |
| `sr_borough` | 311 borough-level yearly stats |
| `sr_category` | 311 top request categories |
| `sr_channel` | 311 submission channels |
| `sr_status` | 311 request statuses |
| `sr_pothole` | 311 pothole-specific stats |
| `contracts_fts` | FTS5 full-text index on contracts |
| `areas` | Hierarchical geography (country → province → city → borough) |
| `area_attributes` | Mutable area data (population, area_km2) with effective dates |
| `area_aliases` | Dataset name normalization for areas |

---

## Key Files

| File | What it does |
|------|-------------|
| `server.js` | Node.js cluster wrapper (8 workers, port 3891) |
| `next.config.ts` | Standalone output, CSP headers, next-intl plugin |
| `src/lib/jurisdiction.ts` | Jurisdiction config (brand, domain, scoring, thresholds) |
| `src/lib/db.ts` | All read-only database queries (multi-DB) |
| `src/lib/data.ts` | Data transforms with `React.cache()` |
| `src/lib/boroughs.ts` | Area name normalization (DB-backed + fallback) |
| `src/lib/scoring.ts` | Borough grading (parameterized target days) |
| `src/lib/types.ts` | All TypeScript interfaces |
| `src/lib/api-auth.ts` | Bearer token + rate limiting |
| `src/app/globals.css` | Tailwind v4 theme (CSS custom properties, dark mode) |
| `scripts/deploy.sh` | Production deploy pipeline |
| `scripts/etl.ts` | Main ETL (permits + contracts) |
| `scripts/migrations/create-areas.js` | Areas hierarchy + seed data migration |
