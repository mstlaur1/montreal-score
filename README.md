# MontréalScore

A free, open-source government accountability tracker. Built for Montreal, designed for any jurisdiction.

**Live:** [montrealscore.ashwater.ca](https://montrealscore.ashwater.ca)

## What is this?

MontréalScore aggregates publicly available government data — construction permits, city contracts, 311 service requests, and campaign promises — and transforms it into clear, comparable performance metrics.

The city publishes the data. We make it legible.

The internals are genericized for multi-jurisdiction support. Montreal is the first jurisdiction; Quebec provincial and Canadian federal are planned. Adding a new jurisdiction requires writing a config file and ETL script, not restructuring the app.

## Why?

Montreal's new mayor promised a **90-day construction permit standard**. The previous administration set a 120-day target. Neither has been publicly tracked. Meanwhile:

- The city-wide median is **213 days**
- Some boroughs average **600+ days**
- Montreal ranks **dead last** among Quebec's 20 largest cities for permit speed

This isn't just about permits. It's about whether your city government spends your tax dollars responsibly and delivers on the promises it made to get elected.

## Features

- **Permit Tracker** — Housing permit processing times by borough vs. the 90-day target, historical trends since 2015, date range filtering with admin period presets
- **Contract Explorer** — Full-text search across 312K+ contracts, procurement forensics (threshold clustering, contract splitting detection, sole-source tracking, supplier growth analysis)
- **311 Dashboard** — Service request volumes, resolution rates, and response times by borough, pothole spotlight
- **Promise Tracker** — 420 campaign promises tracked with source-linked updates, searchable/filterable, first 100 days countdown
- **Bilingual** — Full French and English (French default)
- **Dark Mode** — Automatic based on system preference

## Architecture

### Jurisdiction System

All jurisdiction-specific constants (brand, domain, admin periods, scoring params, inauguration dates, intergovernmental suppliers, procurement thresholds) are centralized in `src/lib/jurisdiction.ts`. Page components pull from this config instead of using hardcoded values.

Geographic data uses a hierarchical `areas` table:
```
Canada → Quebec → Montreal → 19 boroughs
```

With separate tables for mutable attributes (population, area) and dataset name aliases (normalizing variant spellings from different data sources).

### Data Sources

All data comes from [donnees.montreal.ca](https://donnees.montreal.ca), Montreal's official open data portal:

| Dataset | Records | Update Frequency |
|---------|---------|------------------|
| Construction Permits | 457K+ | Weekly |
| City Contracts (5 datasets) | 312K+ | Regular |
| 311 Service Requests | 350K+/year | Quarterly |
| Campaign Promises | 420 | Manual (source-linked) |

Contract data is loaded from 5 separate datasets by approval body (fonctionnaires, conseil municipal, conseil d'agglomeration, comite executif, conseils d'arrondissement). Intergovernmental transfers (ARTM, STM, etc.) are filtered out.

### Tech Stack

- **Framework:** Next.js 16 (App Router, standalone output) + React 19 + TypeScript 5
- **Database:** SQLite via better-sqlite3 (readonly in app, WAL mode)
- **Styling:** Tailwind CSS v4 with CSS custom properties (auto dark mode)
- **Charts:** Recharts v2
- **i18n:** next-intl v4 (French default, English)
- **Search:** FTS5 full-text index on contracts
- **ETL:** TypeScript scripts fetching from Montreal's CKAN SQL API
- **Hosting:** Node.js cluster (8 workers) behind Cloudflare Tunnel on Debian

## Getting Started

### Prerequisites
- Node.js 20+
- npm

### Setup

```bash
# Clone and install
git clone https://github.com/mstlaur1/montreal-score.git
cd montreal-score
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your ADMIN_API_TOKEN and PROJECT_DIR

# Fetch data from Montreal open data portal
npm run etl:full          # Permits + contracts (all years, ~15 min)
npm run etl:311:full      # 311 service requests
npm run promises:seed     # Campaign promises

# Run post-ETL migrations
node scripts/migrations/add-processing-days.js
node scripts/migrations/build-fts.js
node scripts/migrations/cache-permit-trends.js
node scripts/migrations/create-areas.js

# Start development server
npm run dev
```

Open [http://localhost:3000/fr](http://localhost:3000/fr) to see the site.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_API_TOKEN` | Yes | Bearer token for API routes (ETL, promise management) |
| `PROJECT_DIR` | Yes | Absolute path to project root (for ETL API route) |
| `DB_FILE` | No | Database filename (default: `montreal.db`) |

### Available Scripts

```bash
npm run dev              # Dev server with Turbopack (port 3000)
npm run build            # Production build
npm run etl              # Incremental ETL (current + previous year)
npm run etl:full         # Full ETL (all years)
npm run etl:311          # 311 incremental
npm run etl:311:full     # 311 full
npm run promises:seed    # Bulk import campaign promises
npm run admin            # Admin UI for promise management (port 3099)
```

### Production Deployment

```bash
scripts/deploy.sh
```

The deploy script handles the full pipeline: git pull, incremental ETL, migrations (including areas), build, standalone symlinks, systemd service restart, and Cloudflare cache purge.

## Project Structure

```
montreal-score/
├── src/
│   ├── app/[locale]/     # Next.js pages (locale-prefixed routing)
│   │   ├── permits/      # Permit analytics dashboard
│   │   ├── contracts/    # Contract forensics dashboard
│   │   ├── 311/          # Service request analytics
│   │   ├── promises/     # Campaign promise tracker
│   │   ├── about/        # Project info
│   │   ├── volunteer/    # Call to action
│   │   └── api/          # API routes (ETL, promise CRUD)
│   ├── components/       # React components (server + client)
│   ├── lib/
│   │   ├── jurisdiction.ts   # Jurisdiction config (brand, scoring, thresholds)
│   │   ├── db.ts             # Multi-DB read-only queries
│   │   ├── data.ts           # Data transforms + React cache()
│   │   ├── boroughs.ts       # Area name normalization (DB-backed)
│   │   └── scoring.ts        # Borough grading (parameterized targets)
│   └── i18n/             # next-intl config (fr/en routing)
├── scripts/              # ETL, migrations, admin, deploy
├── data/                 # SQLite database + seed data
├── messages/             # Translation JSON files (fr, en)
├── server.js             # Node.js cluster wrapper for production
└── CLAUDE.md             # Development conventions and patterns
```

## Adding a New Jurisdiction (Phase 2)

The app is designed to support multiple governments. To add one:

1. Add a config object to the `JURISDICTIONS` map in `src/lib/jurisdiction.ts`
2. Write an ETL script for the new data source
3. Create a migration to seed the areas hierarchy (province → ridings, etc.)
4. Add i18n strings to the `Jurisdiction` namespace in `messages/`
5. URL routing (`[jurisdiction]` segment) and multi-domain support are Phase 2 concerns

## Contributing

This is an open-source civic project. Contributions are welcome — especially from Canadians who care about holding their governments accountable.

See [CLAUDE.md](CLAUDE.md) for development conventions and patterns.

## License

MIT

## Contact

Built by [Ashwater](https://ashwater.ca).
