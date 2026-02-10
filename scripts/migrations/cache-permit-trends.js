#!/usr/bin/env node
/**
 * Pre-compute permit trend data (yearly medians by filter) and write to JSON cache.
 * This eliminates ~650ms of SQL window-function queries per page load.
 * Run after ETL. Safe to re-run.
 *
 * Usage: node scripts/migrations/cache-permit-trends.js
 */
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_FILE = process.env.DB_FILE || "montreal.db";
const DB_PATH = path.join(__dirname, "..", "..", "data", DB_FILE);
const CACHE_PATH = path.join(__dirname, "..", "..", "data", "permit-trends.json");

const START_YEAR = 2015;

const db = new Database(DB_PATH, { readonly: true });

console.log(`Reading from ${DB_FILE}...`);

// 1. Aggregated counts per (year, permit_type, is_housing) — ~80 rows
console.log("Computing trend aggregates...");
const aggs = db.prepare(`
  SELECT CAST(substr(date_debut, 1, 4) AS INTEGER) AS year,
         permit_type,
         CASE WHEN nb_logements IS NOT NULL AND nb_logements != '' AND CAST(nb_logements AS INTEGER) > 0 THEN 1 ELSE 0 END AS is_housing,
         COUNT(*) AS total,
         SUM(CASE WHEN processing_days IS NOT NULL THEN 1 ELSE 0 END) AS issued
  FROM permits
  WHERE date_debut >= ?
  GROUP BY year, permit_type, is_housing
  ORDER BY year
`).all(`${START_YEAR}-01-01`);

// 2. Combined medians: per (year, permit_type) + "all" — ~60 rows
console.log("Computing medians (all + by type)...");
const combinedMedians = db.prepare(`
  WITH base AS (
    SELECT CAST(substr(date_debut, 1, 4) AS INTEGER) AS year,
           permit_type, processing_days AS days
    FROM permits
    WHERE date_debut >= ? AND processing_days IS NOT NULL
  ),
  by_type AS (
    SELECT year, permit_type AS filter_key, days,
           ROW_NUMBER() OVER (PARTITION BY year, permit_type ORDER BY days) AS rn,
           COUNT(*) OVER (PARTITION BY year, permit_type) AS cnt
    FROM base
  ),
  by_all AS (
    SELECT year, '__all__' AS filter_key, days,
           ROW_NUMBER() OVER (PARTITION BY year ORDER BY days) AS rn,
           COUNT(*) OVER (PARTITION BY year) AS cnt
    FROM base
  ),
  unioned AS (
    SELECT * FROM by_type WHERE rn IN ((cnt+1)/2, (cnt+2)/2)
    UNION ALL
    SELECT * FROM by_all WHERE rn IN ((cnt+1)/2, (cnt+2)/2)
  )
  SELECT year, filter_key, AVG(days) AS median_days
  FROM unioned
  GROUP BY year, filter_key
  ORDER BY year
`).all(`${START_YEAR}-01-01`);

// 3. Housing medians — ~12 rows
console.log("Computing medians (housing)...");
const housingMedians = db.prepare(`
  WITH ranked AS (
    SELECT CAST(substr(date_debut, 1, 4) AS INTEGER) AS year,
           processing_days AS days,
           ROW_NUMBER() OVER (PARTITION BY substr(date_debut, 1, 4) ORDER BY processing_days) AS rn,
           COUNT(*) OVER (PARTITION BY substr(date_debut, 1, 4)) AS cnt
    FROM permits
    WHERE date_debut >= ? AND processing_days IS NOT NULL
      AND nb_logements IS NOT NULL AND nb_logements != '' AND CAST(nb_logements AS INTEGER) > 0
  )
  SELECT year,
         AVG(CASE WHEN rn IN ((cnt+1)/2, (cnt+2)/2) THEN days END) AS median_days,
         MAX(cnt) AS issued
  FROM ranked
  WHERE rn IN ((cnt+1)/2, (cnt+2)/2)
  GROUP BY year
  ORDER BY year
`).all(`${START_YEAR}-01-01`);

db.close();

// Build the same structure as getAllYearlyPermitTrends returns
const filters = ["all", "housing", "TR", "CO", "DE", "CA"];

// totals per (filter, year)
const totals = {};
for (const f of filters) totals[f] = {};

for (const row of aggs) {
  const applicable = ["all"];
  if (row.is_housing) applicable.push("housing");
  const pt = row.permit_type;
  if (pt === "TR") applicable.push("TR");
  else if (pt === "CO") applicable.push("CO");
  else if (pt === "DE") applicable.push("DE");
  else if (pt === "CA") applicable.push("CA");

  for (const f of applicable) {
    totals[f][row.year] = (totals[f][row.year] || 0) + row.total;
  }
}

// median maps
const medianMap = {}; // filter_key → year → median
for (const r of combinedMedians) {
  if (!medianMap[r.filter_key]) medianMap[r.filter_key] = {};
  medianMap[r.filter_key][r.year] = r.median_days;
}
const housingMedianMap = {};
for (const r of housingMedians) housingMedianMap[r.year] = r.median_days;

// Build result
const result = {};
for (const f of filters) {
  const trends = [];
  for (const [yearStr, total] of Object.entries(totals[f])) {
    const year = parseInt(yearStr);
    let medianDays = 0;
    if (f === "all") medianDays = medianMap["__all__"]?.[year] || 0;
    else if (f === "housing") medianDays = housingMedianMap[year] || 0;
    else medianDays = medianMap[f]?.[year] || 0;
    trends.push({ year, total, medianDays });
  }
  result[f] = trends.sort((a, b) => a.year - b.year);
}

fs.writeFileSync(CACHE_PATH, JSON.stringify(result));
const size = fs.statSync(CACHE_PATH).size;
console.log(`Wrote ${CACHE_PATH} (${size} bytes)`);
console.log("Done.");
