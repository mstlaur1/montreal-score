/**
 * ETL script: fetches permits and contracts from Montreal's CKAN API
 * and loads them into a local SQLite database.
 *
 * Usage:
 *   npm run etl          # Incremental: current + previous year
 *   npm run etl:full     # Full: all data since 2000
 */

import Database from "better-sqlite3";
import path from "node:path";

import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data", "montreal.db");
const API_BASE = "https://donnees.montreal.ca/api/3/action";
const PERMITS_RESOURCE_ID = "5232a72d-235a-48eb-ae20-bb9d501300ad";
const CONTRACTS_RESOURCE_ID = "e4b758ab-3edb-4b6a-8764-2a443b6b9404";

const isFullMode = process.argv.includes("--full");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  url: string,
  retries = 3
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, {
      headers: { "User-Agent": "MontréalScore ETL/1.0" },
    });
    if (res.ok) return res;
    if (res.status === 429 || res.status >= 500) {
      const delay = 1000 * 2 ** i;
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
    CREATE TABLE IF NOT EXISTS permits (
      _id            INTEGER PRIMARY KEY,
      arrondissement TEXT,
      date_debut     TEXT,
      date_emission  TEXT
    );

    CREATE TABLE IF NOT EXISTS contracts (
      _id            INTEGER PRIMARY KEY,
      supplier       TEXT,
      numero         TEXT,
      approval_date  TEXT,
      service        TEXT,
      activite       TEXT,
      montant        REAL
    );

    CREATE TABLE IF NOT EXISTS etl_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset     TEXT NOT NULL,
      mode        TEXT NOT NULL,
      rows_loaded INTEGER DEFAULT 0,
      started_at  TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_permits_date ON permits(date_debut);
    CREATE INDEX IF NOT EXISTS idx_permits_borough ON permits(arrondissement);
    CREATE INDEX IF NOT EXISTS idx_contracts_date ON contracts(approval_date);
    CREATE INDEX IF NOT EXISTS idx_contracts_supplier ON contracts(supplier);
  `);
}

// ---------------------------------------------------------------------------
// Permits ETL
// ---------------------------------------------------------------------------

async function loadPermits(db: Database.Database, years: number[]) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO permits (_id, arrondissement, date_debut, date_emission)
    VALUES (@_id, @arrondissement, @date_debut, @date_emission)
  `);
  const insertMany = db.transaction((rows: Record<string, unknown>[]) => {
    for (const r of rows) insert.run(r);
  });

  let totalRows = 0;

  for (const year of years) {
    const sql = `
      SELECT "_id", "arrondissement", "date_debut", "date_emission"
      FROM "${PERMITS_RESOURCE_ID}"
      WHERE "date_debut" >= '${year}-01-01'
        AND "date_debut" < '${year + 1}-01-01'
    `;
    console.log(`📋 Permits ${year}...`);
    const records = await ckanSqlQuery(sql);
    if (records.length > 0) {
      insertMany(records);
    }
    console.log(`   ${records.length} rows`);
    totalRows += records.length;
    await sleep(1000); // rate-limit courtesy
  }

  return totalRows;
}

// ---------------------------------------------------------------------------
// Contracts ETL
// ---------------------------------------------------------------------------

async function loadContracts(db: Database.Database, years: number[]) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO contracts (_id, supplier, numero, approval_date, service, activite, montant)
    VALUES (@_id, @supplier, @numero, @approval_date, @service, @activite, @montant)
  `);
  const insertMany = db.transaction((rows: Record<string, unknown>[]) => {
    for (const r of rows) insert.run(r);
  });

  let totalRows = 0;

  for (const year of years) {
    const sql = `
      SELECT "_id", "NOM DU FOURNISSEUR", "NUMERO", "DATE D'APPROBATION", "SERVICE", "ACTIVITE", "MONTANT"
      FROM "${CONTRACTS_RESOURCE_ID}"
      WHERE "DATE D'APPROBATION" >= '${year}-01-01'
        AND "DATE D'APPROBATION" < '${year + 1}-01-01'
    `;
    console.log(`📄 Contracts ${year}...`);
    const records = await ckanSqlQuery(sql);
    // Map CKAN French column names to clean SQLite column names
    const mapped = records.map((r) => ({
      _id: r["_id"],
      supplier: r["NOM DU FOURNISSEUR"],
      numero: r["NUMERO"],
      approval_date: r["DATE D'APPROBATION"],
      service: r["SERVICE"],
      activite: r["ACTIVITE"],
      montant: r["MONTANT"] ? parseFloat(r["MONTANT"] as string) : null,
    }));
    if (mapped.length > 0) {
      insertMany(mapped);
    }
    console.log(`   ${records.length} rows`);
    totalRows += records.length;
    await sleep(1000);
  }

  return totalRows;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n🔧 MontréalScore ETL — ${isFullMode ? "FULL" : "incremental"} mode\n`);

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);

  const currentYear = new Date().getFullYear();
  const years = isFullMode
    ? Array.from({ length: currentYear - 2000 + 1 }, (_, i) => 2000 + i)
    : [currentYear - 1, currentYear];

  const startedAt = new Date().toISOString();
  const mode = isFullMode ? "full" : "incremental";

  // Permits
  const permitRunId = db
    .prepare("INSERT INTO etl_runs (dataset, mode, started_at) VALUES (?, ?, ?)")
    .run("permits", mode, startedAt).lastInsertRowid;

  const permitRows = await loadPermits(db, years);

  db.prepare("UPDATE etl_runs SET rows_loaded = ?, finished_at = ? WHERE id = ?")
    .run(permitRows, new Date().toISOString(), permitRunId);

  // Contracts
  const contractRunId = db
    .prepare("INSERT INTO etl_runs (dataset, mode, started_at) VALUES (?, ?, ?)")
    .run("contracts", mode, new Date().toISOString()).lastInsertRowid;

  const contractRows = await loadContracts(db, years);

  db.prepare("UPDATE etl_runs SET rows_loaded = ?, finished_at = ? WHERE id = ?")
    .run(contractRows, new Date().toISOString(), contractRunId);

  db.close();

  console.log(`\n✅ Done — ${permitRows} permits + ${contractRows} contracts loaded\n`);
}

main().catch((err) => {
  console.error("❌ ETL failed:", err);
  process.exit(1);
});
