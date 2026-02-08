# MontréalScore

A free, open-source government accountability tracker for Montreal. Borough-by-borough performance grades powered by the city's own open data.

## What is this?

MontréalScore aggregates Montreal's publicly available government data — construction permits, 311 service requests, snow removal, road work, budgets, and more — and transforms it into clear, comparable performance grades for each of Montreal's 19 boroughs.

The city publishes the data. We make it legible.

## Why?

Montreal's new mayor promised a **90-day construction permit standard**. The previous administration set a 120-day target. Neither has been publicly tracked. Meanwhile:

- The city-wide average is **213 days**
- Some boroughs average **600+ days**
- One developer waited **42 months** for a permit
- Montreal ranks **dead last** among Quebec's 20 largest cities for permit speed

This isn't just about permits. It's about whether your borough picks up your 311 calls, clears your street after a snowstorm, finishes road work on time, and spends your tax dollars responsibly.

## Features

- **Borough Scorecards** — A-F letter grades across permits, 311 responsiveness, infrastructure, safety, and fiscal responsibility
- **Permit Tracker** — Processing times by borough vs. the 90-day target, trends since 1990
- **311 Dashboard** — Response times, resolution rates, and the worst "black holes" by category
- **Snow Removal** — Post-storm completion tracking by borough
- **Political Promise Tracker** — Did the mayor deliver on her 100-day plan?
- **Open API** — All data available programmatically

## Data Sources

All data comes from [donnees.montreal.ca](https://donnees.montreal.ca), Montreal's official open data portal:

| Dataset | Update Frequency |
|---|---|
| Construction Permits | Weekly |
| 311 Service Requests | Daily |
| Snow Removal | Seasonal |
| Road Construction | Regular |
| City Contracts | Regular |
| Municipal Budget | Annual |
| Crime Statistics | Regular |

## Tech Stack

- **Frontend:** Next.js 15 + Tailwind CSS
- **Database:** Supabase (PostgreSQL + PostGIS)
- **Data Pipeline:** Python ETL scripts
- **Charts:** Recharts / D3.js
- **Maps:** Mapbox GL JS
- **Hosting:** Vercel
- **i18n:** French-first, English second

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local

# Run the development server
npm run dev

# Run the data pipeline
python scripts/ingest_permits.py
```

## Project Structure

```
montreal-score/
├── src/
│   ├── app/              # Next.js App Router pages
│   ├── components/       # React components
│   ├── lib/              # Utilities, API clients, scoring logic
│   └── i18n/             # Translations (fr/en)
├── scripts/              # Python data ingestion & ETL
├── supabase/             # Database migrations & seed data
└── public/               # Static assets
```

## Contributing

This is an open-source civic project. Contributions are welcome — especially from Montrealers who care about holding their city government accountable.

## License

MIT

## Contact

Built by [Brulé AI](https://brule.ai).
