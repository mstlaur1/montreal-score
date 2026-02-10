# MontréalScore

A free, open-source government accountability tracker for Montreal. Borough-by-borough performance grades powered by the city's own open data.

**Live:** [montrealscore.ashwater.ca](https://montrealscore.ashwater.ca)

## What is this?

MontréalScore aggregates Montreal's publicly available government data — construction permits, city contracts, 311 service requests, and campaign promises — and transforms it into clear, comparable performance metrics for each of Montreal's 19 boroughs.

The city publishes the data. We make it legible.

## Why?

Montreal's new mayor promised a **90-day construction permit standard**. The previous administration set a 120-day target. Neither has been publicly tracked. Meanwhile:

- The city-wide median is **213 days**
- Some boroughs average **600+ days**
- Montreal ranks **dead last** among Quebec's 20 largest cities for permit speed

This isn't just about permits. It's about whether your city government spends your tax dollars responsibly and delivers on the promises it made to get elected.

## Features

- **Permit Tracker** — Housing permit processing times by borough vs. the 90-day target, historical trends since 2015
- **Contract Explorer** — Procurement analysis with threshold clustering, contract splitting detection, sole-source tracking
- **311 Dashboard** — Service request volumes, resolution rates, and response times by borough
- **Promise Tracker** — First 100 days and full platform promises with source-linked status updates
- **Bilingual** — Full French and English support

## Data Sources

All data comes from [donnees.montreal.ca](https://donnees.montreal.ca), Montreal's official open data portal:

| Dataset | Update Frequency |
|---|---|
| Construction Permits | Weekly |
| City Contracts | Regular |
| 311 Service Requests | Quarterly |
| Campaign Promises | Manual (source-linked) |

## Tech Stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript 5
- **Styling:** Tailwind CSS v4
- **Database:** SQLite (better-sqlite3, readonly in app, WAL mode)
- **Charts:** Recharts v2
- **i18n:** next-intl v4 (French default, English)
- **ETL:** TypeScript scripts fetching from Montreal's CKAN API
- **Hosting:** Cloudflare Tunnel → Debian home server

## Getting Started

```bash
# Install dependencies
npm install

# Fetch data from Montreal open data portal
npm run etl:full        # permits + contracts (all years)
npm run etl:311:full    # 311 service requests
npm run promises:seed   # campaign promises

# Run the development server
npm run dev
```

## Project Structure

```
montreal-score/
├── src/
│   ├── app/              # Next.js App Router pages
│   ├── components/       # React components
│   ├── lib/              # Data layer, scoring, types
│   └── i18n/             # Routing, translations (fr/en)
├── scripts/              # TypeScript ETL & seed scripts
├── data/                 # SQLite database + seed data
└── messages/             # Translation JSON files
```

## Contributing

This is an open-source civic project. Contributions are welcome — especially from Montrealers who care about holding their city government accountable.

## License

MIT

## Contact

Built by [Ashwater](https://ashwater.ca).
