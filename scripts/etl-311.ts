/**
 * ETL script for 311 service requests.
 * Runs aggregate SQL queries against Montreal's CKAN API and stores
 * summary data in SQLite. Avoids downloading millions of raw rows.
 *
 * Usage:
 *   npx tsx scripts/etl-311.ts          # Current resource only (2022+)
 *   npx tsx scripts/etl-311.ts --full   # All archive resources (2016+)
 */

import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data", "montreal.db");
const API_BASE = "https://donnees.montreal.ca/api/3/action";

const isFullMode = process.argv.includes("--full");

// CKAN resource IDs for 311 data (split by time period)
const SR_SOURCES = [
  { id: "2cfa0e06-9be4-49a6-b7f1-ee9f2363a872", label: "2022–present", yearsFrom: 2022, yearsTo: 2027, current: true },
  { id: "dbfc05f8-b939-4639-ae52-2e77f738e43f", label: "2019–2021", yearsFrom: 2019, yearsTo: 2022, current: false },
  { id: "dbc02208-907c-46ff-a052-e4c42042d327", label: "2016–2018", yearsFrom: 2016, yearsTo: 2019, current: false },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, retries = 5): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, {
      headers: { "User-Agent": "MontréalScore ETL/1.0" },
    });
    if (res.ok) return res;
    if (res.status === 403 || res.status === 409 || res.status === 429 || res.status >= 500) {
      const delay = 3000 * 2 ** i;
      console.log(`  ⏳ ${res.status} — retrying in ${delay}ms...`);
      await sleep(delay);
      continue;
    }
    throw new Error(`CKAN API error: ${res.status} ${res.statusText}`);
  }
  throw new Error("Max retries exceeded");
}

async function ckanSqlQuery(sql: string): Promise<Record<string, unknown>[]> {
  const url = `${API_BASE}/datastore_search_sql?sql=${encodeURIComponent(sql)}`;
  const res = await fetchWithRetry(url);
  const data = await res.json();
  if (!data.success) {
    throw new Error(`CKAN error: ${JSON.stringify(data.error)}`);
  }
  return data.result.records;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function initSchema(db: Database.Database) {
  db.exec(`
    -- Monthly request volume (for trend charts)
    CREATE TABLE IF NOT EXISTS sr_monthly (
      year_month TEXT NOT NULL,
      nature     TEXT NOT NULL,
      count      INTEGER NOT NULL,
      PRIMARY KEY (year_month, nature)
    );

    -- Borough yearly stats (for comparison)
    CREATE TABLE IF NOT EXISTS sr_borough (
      year              INTEGER NOT NULL,
      borough           TEXT NOT NULL,
      total_count       INTEGER NOT NULL,
      completed_count   INTEGER NOT NULL,
      avg_response_days REAL,
      PRIMARY KEY (year, borough)
    );

    -- Category ranking
    CREATE TABLE IF NOT EXISTS sr_category (
      year     INTEGER NOT NULL,
      category TEXT NOT NULL,
      count    INTEGER NOT NULL,
      PRIMARY KEY (year, category)
    );

    -- Channel distribution
    CREATE TABLE IF NOT EXISTS sr_channel (
      year    INTEGER NOT NULL,
      channel TEXT NOT NULL,
      count   INTEGER NOT NULL,
      PRIMARY KEY (year, channel)
    );

    -- Status distribution
    CREATE TABLE IF NOT EXISTS sr_status (
      year   INTEGER NOT NULL,
      status TEXT NOT NULL,
      count  INTEGER NOT NULL,
      PRIMARY KEY (year, status)
    );

    -- Pothole spotlight
    CREATE TABLE IF NOT EXISTS sr_pothole (
      year              INTEGER PRIMARY KEY,
      total_count       INTEGER NOT NULL,
      completed_count   INTEGER NOT NULL DEFAULT 0,
      avg_response_days REAL
    );

    CREATE INDEX IF NOT EXISTS idx_sr_monthly_month ON sr_monthly(year_month);
    CREATE INDEX IF NOT EXISTS idx_sr_borough_year ON sr_borough(year);
  `);
}

// ---------------------------------------------------------------------------
// Aggregate queries per resource
// ---------------------------------------------------------------------------

async function loadMonthlyVolume(
  db: Database.Database,
  resourceId: string,
  label: string,
) {
  console.log(`  📊 Monthly volume...`);
  const sql = `
    SELECT substr("DDS_DATE_CREATION", 1, 7) AS month,
           "NATURE" AS nature,
           COUNT(*) AS count
    FROM "${resourceId}"
    WHERE "DDS_DATE_CREATION" IS NOT NULL
    GROUP BY substr("DDS_DATE_CREATION", 1, 7), "NATURE"
    ORDER BY month
  `;
  const rows = await ckanSqlQuery(sql);

  const upsert = db.prepare(`
    INSERT INTO sr_monthly (year_month, nature, count)
    VALUES (?, ?, ?)
    ON CONFLICT(year_month, nature) DO UPDATE SET count = excluded.count
  `);
  const tx = db.transaction(() => {
    for (const r of rows) {
      const month = r.month as string;
      if (!month || month.length < 7) continue;
      upsert.run(month, r.nature as string, r.count as number);
    }
  });
  tx();
  console.log(`     ${rows.length} month/nature combos`);
}

async function loadBoroughStats(
  db: Database.Database,
  resourceId: string,
  label: string,
) {
  console.log(`  📊 Borough stats (total)...`);

  // Total counts per borough/year (simple query, no CAST or CASE WHEN)
  const totalSql = `
    SELECT substr("DDS_DATE_CREATION", 1, 4) AS year,
           "ARRONDISSEMENT" AS borough,
           COUNT(*) AS total_count
    FROM "${resourceId}"
    WHERE "ARRONDISSEMENT" IS NOT NULL
      AND "ARRONDISSEMENT" <> ''
      AND "DDS_DATE_CREATION" IS NOT NULL
    GROUP BY substr("DDS_DATE_CREATION", 1, 4), "ARRONDISSEMENT"
  `;
  const totalRows = await ckanSqlQuery(totalSql);
  await sleep(3000);

  // Completed counts per borough/year (separate simple query)
  console.log(`  📊 Borough stats (completed)...`);
  const completedSql = `
    SELECT substr("DDS_DATE_CREATION", 1, 4) AS year,
           "ARRONDISSEMENT" AS borough,
           COUNT(*) AS completed_count
    FROM "${resourceId}"
    WHERE "ARRONDISSEMENT" IS NOT NULL
      AND "ARRONDISSEMENT" <> ''
      AND "DDS_DATE_CREATION" IS NOT NULL
      AND "DERNIER_STATUT" = 'Terminée'
    GROUP BY substr("DDS_DATE_CREATION", 1, 4), "ARRONDISSEMENT"
  `;
  const completedRows = await ckanSqlQuery(completedSql);
  await sleep(3000);

  // Response time
  console.log(`  📊 Response times...`);
  let timeRows: Record<string, unknown>[] = [];
  try {
    // PostgreSQL date subtraction: date - date = integer (days)
    const timeSql = `
      SELECT substr("DDS_DATE_CREATION", 1, 4) AS year,
             "ARRONDISSEMENT" AS borough,
             AVG(substr("DATE_DERNIER_STATUT", 1, 10)::date - substr("DDS_DATE_CREATION", 1, 10)::date) AS avg_days
      FROM "${resourceId}"
      WHERE "DERNIER_STATUT" = 'Terminée'
        AND "ARRONDISSEMENT" IS NOT NULL
        AND "ARRONDISSEMENT" <> ''
        AND "DATE_DERNIER_STATUT" IS NOT NULL
        AND "DDS_DATE_CREATION" IS NOT NULL
      GROUP BY substr("DDS_DATE_CREATION", 1, 4), "ARRONDISSEMENT"
    `;
    timeRows = await ckanSqlQuery(timeSql);
  } catch {
    console.log(`     ⚠️  Response time calculation not available from CKAN`);
  }

  // Merge total + completed + response time
  const completedMap = new Map<string, number>();
  for (const r of completedRows) {
    const key = `${r.year}|${r.borough}`;
    completedMap.set(key, r.completed_count as number);
  }
  const timeMap = new Map<string, number>();
  for (const r of timeRows) {
    const key = `${r.year}|${r.borough}`;
    timeMap.set(key, r.avg_days as number);
  }

  const upsert = db.prepare(`
    INSERT INTO sr_borough (year, borough, total_count, completed_count, avg_response_days)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(year, borough) DO UPDATE SET
      total_count = excluded.total_count,
      completed_count = excluded.completed_count,
      avg_response_days = excluded.avg_response_days
  `);
  const tx = db.transaction(() => {
    for (const r of totalRows) {
      const year = parseInt(r.year as string, 10);
      const borough = r.borough as string;
      const key = `${r.year}|${borough}`;
      const completed = completedMap.get(key) ?? 0;
      const avgDays = timeMap.get(key) ?? null;
      upsert.run(year, borough, r.total_count as number, completed, avgDays);
    }
  });
  tx();
  console.log(`     ${totalRows.length} borough/year combos, ${timeRows.length} with response time`);
}

async function loadCategories(
  db: Database.Database,
  resourceId: string,
) {
  console.log(`  📊 Categories...`);
  const sql = `
    SELECT substr("DDS_DATE_CREATION", 1, 4) AS year,
           "ACTI_NOM" AS category,
           COUNT(*) AS count
    FROM "${resourceId}"
    WHERE "ACTI_NOM" IS NOT NULL
      AND "ACTI_NOM" <> ''
      AND "DDS_DATE_CREATION" IS NOT NULL
    GROUP BY substr("DDS_DATE_CREATION", 1, 4), "ACTI_NOM"
    ORDER BY count DESC
  `;
  const rows = await ckanSqlQuery(sql);

  const upsert = db.prepare(`
    INSERT INTO sr_category (year, category, count)
    VALUES (?, ?, ?)
    ON CONFLICT(year, category) DO UPDATE SET count = excluded.count
  `);
  const tx = db.transaction(() => {
    for (const r of rows) {
      upsert.run(parseInt(r.year as string, 10), r.category as string, r.count as number);
    }
  });
  tx();
  console.log(`     ${rows.length} category/year combos`);
}

async function loadChannels(
  db: Database.Database,
  resourceId: string,
) {
  console.log(`  📊 Channels...`);
  const sql = `
    SELECT substr("DDS_DATE_CREATION", 1, 4) AS year,
           "PROVENANCE_ORIGINALE" AS channel,
           COUNT(*) AS count
    FROM "${resourceId}"
    WHERE "PROVENANCE_ORIGINALE" IS NOT NULL
      AND "PROVENANCE_ORIGINALE" <> ''
      AND "DDS_DATE_CREATION" IS NOT NULL
    GROUP BY substr("DDS_DATE_CREATION", 1, 4), "PROVENANCE_ORIGINALE"
  `;
  const rows = await ckanSqlQuery(sql);

  const upsert = db.prepare(`
    INSERT INTO sr_channel (year, channel, count)
    VALUES (?, ?, ?)
    ON CONFLICT(year, channel) DO UPDATE SET count = excluded.count
  `);
  const tx = db.transaction(() => {
    for (const r of rows) {
      upsert.run(parseInt(r.year as string, 10), r.channel as string, r.count as number);
    }
  });
  tx();
  console.log(`     ${rows.length} channel/year combos`);
}

async function loadStatuses(
  db: Database.Database,
  resourceId: string,
) {
  console.log(`  📊 Statuses...`);
  const sql = `
    SELECT substr("DDS_DATE_CREATION", 1, 4) AS year,
           "DERNIER_STATUT" AS status,
           COUNT(*) AS count
    FROM "${resourceId}"
    WHERE "DERNIER_STATUT" IS NOT NULL
      AND "DDS_DATE_CREATION" IS NOT NULL
    GROUP BY substr("DDS_DATE_CREATION", 1, 4), "DERNIER_STATUT"
  `;
  const rows = await ckanSqlQuery(sql);

  const upsert = db.prepare(`
    INSERT INTO sr_status (year, status, count)
    VALUES (?, ?, ?)
    ON CONFLICT(year, status) DO UPDATE SET count = excluded.count
  `);
  const tx = db.transaction(() => {
    for (const r of rows) {
      upsert.run(parseInt(r.year as string, 10), r.status as string, r.count as number);
    }
  });
  tx();
  console.log(`     ${rows.length} status/year combos`);
}

async function loadPotholeStats(
  db: Database.Database,
  resourceId: string,
) {
  console.log(`  📊 Pothole stats (total)...`);
  const totalSql = `
    SELECT substr("DDS_DATE_CREATION", 1, 4) AS year,
           COUNT(*) AS total_count
    FROM "${resourceId}"
    WHERE "ACTI_NOM" = 'Nid-de-poule'
      AND "DDS_DATE_CREATION" IS NOT NULL
    GROUP BY substr("DDS_DATE_CREATION", 1, 4)
  `;
  const totalRows = await ckanSqlQuery(totalSql);
  await sleep(3000);

  console.log(`  📊 Pothole stats (completed)...`);
  const completedSql = `
    SELECT substr("DDS_DATE_CREATION", 1, 4) AS year,
           COUNT(*) AS completed_count
    FROM "${resourceId}"
    WHERE "ACTI_NOM" = 'Nid-de-poule'
      AND "DERNIER_STATUT" = 'Terminée'
      AND "DDS_DATE_CREATION" IS NOT NULL
    GROUP BY substr("DDS_DATE_CREATION", 1, 4)
  `;
  const completedRows = await ckanSqlQuery(completedSql);
  await sleep(3000);

  console.log(`  📊 Pothole response times...`);
  let timeRows: Record<string, unknown>[] = [];
  try {
    const timeSql = `
      SELECT substr("DDS_DATE_CREATION", 1, 4) AS year,
             AVG(substr("DATE_DERNIER_STATUT", 1, 10)::date - substr("DDS_DATE_CREATION", 1, 10)::date) AS avg_days
      FROM "${resourceId}"
      WHERE "ACTI_NOM" = 'Nid-de-poule'
        AND "DERNIER_STATUT" = 'Terminée'
        AND "DATE_DERNIER_STATUT" IS NOT NULL
        AND "DDS_DATE_CREATION" IS NOT NULL
      GROUP BY substr("DDS_DATE_CREATION", 1, 4)
    `;
    timeRows = await ckanSqlQuery(timeSql);
  } catch {
    console.log(`     ⚠️  Pothole response time not available from CKAN`);
  }

  const completedMap = new Map<string, number>();
  for (const r of completedRows) {
    completedMap.set(r.year as string, r.completed_count as number);
  }
  const timeMap = new Map<string, number>();
  for (const r of timeRows) {
    timeMap.set(r.year as string, r.avg_days as number);
  }

  const upsert = db.prepare(`
    INSERT INTO sr_pothole (year, total_count, completed_count, avg_response_days)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(year) DO UPDATE SET
      total_count = excluded.total_count,
      completed_count = excluded.completed_count,
      avg_response_days = excluded.avg_response_days
  `);
  const tx = db.transaction(() => {
    for (const r of totalRows) {
      const year = parseInt(r.year as string, 10);
      const completed = completedMap.get(r.year as string) ?? 0;
      const avgDays = timeMap.get(r.year as string) ?? null;
      upsert.run(year, r.total_count as number, completed, avgDays);
    }
  });
  tx();
  console.log(`     ${totalRows.length} pothole year entries`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n🔧 MontréalScore 311 ETL — ${isFullMode ? "FULL" : "current only"} mode\n`);

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  initSchema(db);

  const sources = isFullMode ? SR_SOURCES : SR_SOURCES.filter((s) => s.current);

  for (const src of sources) {
    console.log(`\n📋 Loading: ${src.label} (resource: ${src.id.slice(0, 8)}...)`);

    await loadMonthlyVolume(db, src.id, src.label);
    await sleep(3000);

    await loadBoroughStats(db, src.id, src.label);
    await sleep(3000);

    await loadCategories(db, src.id);
    await sleep(3000);

    await loadChannels(db, src.id);
    await sleep(3000);

    await loadStatuses(db, src.id);
    await sleep(3000);

    await loadPotholeStats(db, src.id);
    await sleep(3000);
  }

  // Record ETL run
  db.prepare(
    `INSERT INTO etl_runs (dataset, mode, rows_loaded, started_at, finished_at)
     VALUES ('311', ?, 0, ?, ?)`
  ).run(isFullMode ? "full" : "incremental", new Date().toISOString(), new Date().toISOString());

  db.close();
  console.log(`\n✅ 311 ETL complete\n`);
}

main().catch((err) => {
  console.error("❌ 311 ETL failed:", err);
  process.exit(1);
});
