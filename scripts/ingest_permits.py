#!/usr/bin/env python3
"""
Ingest construction permit data from Montreal's open data portal.

Data source: https://donnees.montreal.ca/ville-de-montreal/permis-construction
API: CKAN datastore_search_sql

Usage:
    python ingest_permits.py                  # Incremental: last 2 years
    python ingest_permits.py --full           # Full: all data since 1990
    python ingest_permits.py --year 2025      # Specific year
    python ingest_permits.py --stats-only     # Recompute stats without re-ingesting
"""

import argparse
import json
import os
import sys
from datetime import datetime, date

import requests

API_BASE = "https://data.montreal.ca/api/3/action"
RESOURCE_ID = "5232a72d-235a-48eb-ae20-bb9d501300ad"

# Borough name normalization mapping
BOROUGH_ALIASES = {
    "Côte-des-Neiges—Notre-Dame-de-Grâce": "Côte-des-Neiges-Notre-Dame-de-Grâce",
    "Mercier—Hochelaga-Maisonneuve": "Mercier-Hochelaga-Maisonneuve",
    "L'Île-Bizard—Sainte-Geneviève": "L'Île-Bizard-Sainte-Geneviève",
    "Rivière-des-Prairies—Pointe-aux-Trembles": "Rivière-des-Prairies-Pointe-aux-Trembles",
    "Villeray—Saint-Michel—Parc-Extension": "Villeray-Saint-Michel-Parc-Extension",
    "Plateau-Mont-Royal": "Le Plateau-Mont-Royal",
    "Plateau Mont-Royal": "Le Plateau-Mont-Royal",
    "Sud-Ouest": "Le Sud-Ouest",
    "Montreal-Nord": "Montréal-Nord",
    "Saint-Leonard": "Saint-Léonard",
}


def normalize_borough(name: str) -> str:
    """Normalize borough names to canonical form."""
    if not name:
        return ""
    cleaned = name.strip().replace("\u2014", "-").replace("\u2013", "-")
    return BOROUGH_ALIASES.get(cleaned, cleaned)


def fetch_permits_sql(sql: str) -> list[dict]:
    """Execute a SQL query against the Montreal CKAN API."""
    url = f"{API_BASE}/datastore_search_sql"
    params = {"sql": sql}

    response = requests.get(url, params=params, timeout=120)
    response.raise_for_status()

    data = response.json()
    if not data.get("success"):
        raise RuntimeError(f"API error: {json.dumps(data.get('error', {}))}")

    return data["result"]["records"]


def fetch_permits_paginated(year: int | None = None, limit: int = 32000) -> list[dict]:
    """Fetch permits using datastore_search with pagination."""
    all_records = []
    offset = 0

    while True:
        url = f"{API_BASE}/datastore_search"
        params = {
            "resource_id": RESOURCE_ID,
            "limit": limit,
            "offset": offset,
        }
        if year:
            params["q"] = ""  # We'll filter after

        response = requests.get(url, params=params, timeout=120)
        response.raise_for_status()
        data = response.json()

        if not data.get("success"):
            raise RuntimeError(f"API error: {json.dumps(data.get('error', {}))}")

        records = data["result"]["records"]
        if not records:
            break

        all_records.extend(records)
        offset += limit

        total = data["result"].get("total", 0)
        print(f"  Fetched {len(all_records)}/{total} records...")

        if len(all_records) >= total:
            break

    return all_records


def process_permit(raw: dict) -> dict:
    """Process a raw permit record into normalized form."""
    app_date = raw.get("date_debut")
    issue_date = raw.get("date_emission")

    processing_days = None
    if app_date and issue_date:
        try:
            d1 = datetime.fromisoformat(app_date.replace("Z", "+00:00")).date()
            d2 = datetime.fromisoformat(issue_date.replace("Z", "+00:00")).date()
            processing_days = (d2 - d1).days
            if processing_days < 0:
                processing_days = None  # Bad data
        except (ValueError, TypeError):
            pass

    borough_raw = raw.get("arrondissement", "") or ""
    borough = normalize_borough(borough_raw)

    lat = raw.get("latitude")
    lon = raw.get("longitude")

    return {
        "external_id": raw.get("no_demande"),
        "permit_id": raw.get("id_permis"),
        "application_date": app_date[:10] if app_date else None,
        "issue_date": issue_date[:10] if issue_date else None,
        "processing_days": processing_days,
        "address": raw.get("emplacement"),
        "borough_raw": borough_raw,
        "borough_normalized": borough,
        "type_code": raw.get("code_type_base_demande", ""),
        "type_description": raw.get("description_type_demande"),
        "building_type": raw.get("description_type_batiment"),
        "building_category": raw.get("description_categorie_batiment"),
        "work_nature": raw.get("nature_travaux"),
        "housing_units": raw.get("nb_logements"),
        "latitude": float(lat) if lat else None,
        "longitude": float(lon) if lon else None,
    }


def compute_borough_stats(permits: list[dict], year: int) -> list[dict]:
    """Compute borough-level statistics from processed permits."""
    from collections import defaultdict

    by_borough: dict[str, list[dict]] = defaultdict(list)
    for p in permits:
        if p["borough_normalized"]:
            by_borough[p["borough_normalized"]].append(p)

    stats = []
    for borough, borough_permits in sorted(by_borough.items()):
        total = len(borough_permits)
        issued = [p for p in borough_permits if p["issue_date"]]
        pending = total - len(issued)

        days = sorted(
            [p["processing_days"] for p in issued if p["processing_days"] is not None and p["processing_days"] >= 0]
        )

        if days:
            median_idx = len(days) // 2
            median = days[median_idx] if len(days) % 2 else (days[median_idx - 1] + days[median_idx]) / 2
            avg = sum(days) / len(days)
            p90_idx = int(len(days) * 0.9)
            p90 = days[min(p90_idx, len(days) - 1)]
            within_90 = sum(1 for d in days if d <= 90) / len(days) * 100
            within_120 = sum(1 for d in days if d <= 120) / len(days) * 100
        else:
            median = avg = p90 = 0
            within_90 = within_120 = 0

        stats.append({
            "borough": borough,
            "year": year,
            "total_permits": total,
            "permits_issued": len(issued),
            "permits_pending": pending,
            "median_processing_days": round(median, 1),
            "avg_processing_days": round(avg, 1),
            "p90_processing_days": round(p90, 1),
            "pct_within_90_days": round(within_90, 2),
            "pct_within_120_days": round(within_120, 2),
        })

    return stats


def print_stats_table(stats: list[dict]) -> None:
    """Print a formatted table of borough stats."""
    print(f"\n{'Borough':<45} {'Total':>6} {'Issued':>7} {'Median':>7} {'P90':>7} {'≤90d':>6} {'≤120d':>6}")
    print("-" * 100)

    for s in sorted(stats, key=lambda x: x["median_processing_days"], reverse=True):
        print(
            f"{s['borough']:<45} "
            f"{s['total_permits']:>6} "
            f"{s['permits_issued']:>7} "
            f"{s['median_processing_days']:>6.0f}d "
            f"{s['p90_processing_days']:>6.0f}d "
            f"{s['pct_within_90_days']:>5.1f}% "
            f"{s['pct_within_120_days']:>5.1f}%"
        )


def save_json(data: list[dict], filepath: str) -> None:
    """Save data to a JSON file."""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)
    print(f"Saved {len(data)} records to {filepath}")


def main():
    parser = argparse.ArgumentParser(description="Ingest Montreal permit data")
    parser.add_argument("--full", action="store_true", help="Full historical load")
    parser.add_argument("--year", type=int, help="Specific year to process")
    parser.add_argument("--stats-only", action="store_true", help="Recompute stats from cached data")
    parser.add_argument("--output-dir", default="data", help="Output directory")
    args = parser.parse_args()

    current_year = date.today().year

    if args.year:
        years = [args.year]
    elif args.full:
        years = list(range(1990, current_year + 1))
    else:
        # Incremental: last 2 years
        years = [current_year - 1, current_year]

    output_dir = args.output_dir

    for year in years:
        print(f"\n{'=' * 60}")
        print(f"Processing year {year}")
        print(f"{'=' * 60}")

        cache_file = os.path.join(output_dir, "raw", f"permits_{year}.json")

        if args.stats_only and os.path.exists(cache_file):
            print(f"Loading cached data from {cache_file}")
            with open(cache_file, encoding="utf-8") as f:
                raw_records = json.load(f)
        else:
            print(f"Fetching permits for {year} from Montreal API...")
            try:
                sql = (
                    f'SELECT * FROM "{RESOURCE_ID}" '
                    f"WHERE EXTRACT(YEAR FROM \"date_debut\") = {year} "
                    f"ORDER BY \"date_debut\" DESC"
                )
                raw_records = fetch_permits_sql(sql)
                print(f"  Got {len(raw_records)} records via SQL")
            except Exception as e:
                print(f"  SQL query failed ({e}), trying paginated fetch...")
                raw_records = fetch_permits_paginated(year)
                # Filter to correct year
                raw_records = [
                    r for r in raw_records
                    if r.get("date_debut") and r["date_debut"][:4] == str(year)
                ]
                print(f"  Got {len(raw_records)} records for {year}")

            # Cache raw data
            save_json(raw_records, cache_file)

        if not raw_records:
            print(f"  No records for {year}, skipping")
            continue

        # Process
        processed = [process_permit(r) for r in raw_records]
        processed = [p for p in processed if p["application_date"]]

        # Compute stats
        stats = compute_borough_stats(processed, year)
        print_stats_table(stats)

        # Save processed data and stats
        save_json(processed, os.path.join(output_dir, f"permits_{year}_processed.json"))
        save_json(stats, os.path.join(output_dir, f"borough_stats_{year}.json"))

    # If we processed multiple years, save a combined stats file
    if len(years) > 1:
        all_stats = []
        for year in years:
            stats_file = os.path.join(output_dir, f"borough_stats_{year}.json")
            if os.path.exists(stats_file):
                with open(stats_file, encoding="utf-8") as f:
                    all_stats.extend(json.load(f))
        save_json(all_stats, os.path.join(output_dir, "borough_stats_all.json"))

    print("\nDone!")


if __name__ == "__main__":
    main()
