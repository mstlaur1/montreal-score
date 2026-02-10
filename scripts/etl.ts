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

// Four contract datasets — each approved by a different body
const CONTRACT_SOURCES = [
  {
    id: "e4b758ab-3edb-4b6a-8764-2a443b6b9404",
    source: "fonctionnaires",
    label: "Fonctionnaires",
    dateCol: "DATE D'APPROBATION",
    supplierCol: "NOM DU FOURNISSEUR",
    serviceCol: "SERVICE",
    amountCol: "MONTANT",
    descCol: "ACTIVITE",       // used as description
    idOffset: 0,               // offset to avoid _id collisions
  },
  {
    id: "1e5ab066-f560-4b4f-8f12-991de39df134",
    source: "conseil_municipal",
    label: "Conseil municipal",
    dateCol: "DATE SIGNATURE",
    supplierCol: "FOURNISSEUR",
    serviceCol: "SERVICE",
    amountCol: "MONTANT",
    descCol: "OBJET",
    idOffset: 1_000_000,
  },
  {
    id: "7cf955d0-a3e6-4e94-8c24-9b0a4f7c0408",
    source: "conseil_agglomeration",
    label: "Conseil d'agglomération",
    dateCol: "DATE SIGNATURE",
    supplierCol: "FOURNISSEUR",
    serviceCol: "SERVICE",
    amountCol: "MONTANT",
    descCol: "OBJET",
    idOffset: 2_000_000,
  },
  {
    id: "4b2d8744-a257-4102-8897-95a30a20de34",
    source: "comite_executif",
    label: "Comité exécutif",
    dateCol: "DATE SIGNATURE",
    supplierCol: "FOURNISSEUR",
    serviceCol: "SERVICE",
    amountCol: "MONTANT",
    descCol: "OBJET",
    idOffset: 3_000_000,
  },
  {
    id: "941c7e36-a831-4228-b737-21174c6a1864",
    source: "conseils_arrondissement",
    label: "Conseils d'arrondissement",
    dateCol: "DATE SIGNATURE",
    supplierCol: "FOURNISSEUR",
    serviceCol: "SERVICE",
    amountCol: "MONTANT",
    descCol: "OBJET",
    idOffset: 4_000_000,
  },
] as const;

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
  // Migration: add new columns if missing (for existing DBs)
  try {
    db.exec(`ALTER TABLE permits ADD COLUMN permit_type TEXT`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE permits ADD COLUMN nb_logements INTEGER`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE promises ADD COLUMN needs_help INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }

  db.exec(`
    CREATE TABLE IF NOT EXISTS permits (
      _id            INTEGER PRIMARY KEY,
      arrondissement TEXT,
      date_debut     TEXT,
      date_emission  TEXT,
      permit_type    TEXT,
      nb_logements   INTEGER
    );

    CREATE TABLE IF NOT EXISTS contracts (
      _id            INTEGER PRIMARY KEY,
      supplier       TEXT,
      numero         TEXT,
      approval_date  TEXT,
      service        TEXT,
      activite       TEXT,
      montant        REAL,
      source         TEXT,
      description    TEXT
    );

    CREATE TABLE IF NOT EXISTS etl_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset     TEXT NOT NULL,
      mode        TEXT NOT NULL,
      rows_loaded INTEGER DEFAULT 0,
      started_at  TEXT NOT NULL,
      finished_at TEXT
    );

    -- Migration: add columns if missing (idempotent via pragma check)
    CREATE INDEX IF NOT EXISTS idx_permits_date ON permits(date_debut);
    CREATE INDEX IF NOT EXISTS idx_permits_borough ON permits(arrondissement);
    CREATE INDEX IF NOT EXISTS idx_contracts_date ON contracts(approval_date);
    CREATE INDEX IF NOT EXISTS idx_contracts_supplier ON contracts(supplier);
    CREATE INDEX IF NOT EXISTS idx_contracts_source ON contracts(source);

    CREATE TABLE IF NOT EXISTS promises (
      id              TEXT PRIMARY KEY,
      category        TEXT NOT NULL,
      subcategory     TEXT,
      borough         TEXT,
      text_fr         TEXT NOT NULL,
      text_en         TEXT NOT NULL,
      measurable      INTEGER NOT NULL DEFAULT 0,
      target_value    TEXT,
      target_timeline TEXT,
      status          TEXT NOT NULL DEFAULT 'not_started',
      auto_trackable  INTEGER NOT NULL DEFAULT 0,
      data_source     TEXT,
      first_100_days  INTEGER NOT NULL DEFAULT 0,
      needs_help      INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS promise_updates (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      promise_id  TEXT NOT NULL REFERENCES promises(id),
      date        TEXT NOT NULL,
      source_url  TEXT,
      source_title TEXT,
      summary_fr  TEXT,
      summary_en  TEXT,
      sentiment   TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_promise_updates_promise ON promise_updates(promise_id);
    CREATE INDEX IF NOT EXISTS idx_promises_category ON promises(category);
    CREATE INDEX IF NOT EXISTS idx_promises_status ON promises(status);
  `);
}

// ---------------------------------------------------------------------------
// Permits ETL
// ---------------------------------------------------------------------------

async function loadPermits(db: Database.Database, years: number[]) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO permits (_id, arrondissement, date_debut, date_emission, permit_type, nb_logements)
    VALUES (@_id, @arrondissement, @date_debut, @date_emission, @permit_type, @nb_logements)
  `);
  const insertMany = db.transaction((rows: Record<string, unknown>[]) => {
    for (const r of rows) insert.run(r);
  });

  let totalRows = 0;

  for (const year of years) {
    const sql = `
      SELECT "_id", "arrondissement", "date_debut", "date_emission",
             "code_type_base_demande" AS "permit_type", "nb_logements"
      FROM "${PERMITS_RESOURCE_ID}"
      WHERE "date_debut" >= '${year}-01-01'
        AND "date_debut" < '${year + 1}-01-01'
    `;
    console.log(`📋 Permits ${year}...`);
    const records = await ckanSqlQuery(sql);
    // nb_logements comes as string from CKAN — parse to integer
    const mapped = records.map((r) => ({
      ...r,
      nb_logements: r.nb_logements ? parseInt(r.nb_logements as string, 10) || null : null,
    }));
    if (mapped.length > 0) {
      insertMany(mapped);
    }
    console.log(`   ${records.length} rows`);
    totalRows += records.length;
    await sleep(1000); // rate-limit courtesy
  }

  return totalRows;
}

// ---------------------------------------------------------------------------
// Contracts ETL — loads all 4 contract datasets
// ---------------------------------------------------------------------------

async function loadContracts(db: Database.Database, years: number[]) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO contracts (_id, supplier, numero, approval_date, service, activite, montant, source, description)
    VALUES (@_id, @supplier, @numero, @approval_date, @service, @activite, @montant, @source, @description)
  `);
  const insertMany = db.transaction((rows: Record<string, unknown>[]) => {
    for (const r of rows) insert.run(r);
  });

  let totalRows = 0;

  for (const src of CONTRACT_SOURCES) {
    console.log(`\n📄 Loading: ${src.label}`);

    for (const year of years) {
      const sql = `
        SELECT "_id", "${src.supplierCol}", "${src.dateCol}", "${src.serviceCol}", "${src.amountCol}"${
          src.descCol ? `, "${src.descCol}"` : ""
        }
        FROM "${src.id}"
        WHERE "${src.dateCol}" >= '${year}-01-01'
          AND "${src.dateCol}" < '${year + 1}-01-01'
      `;
      console.log(`   ${year}...`);
      const records = await ckanSqlQuery(sql);
      const mapped = records.map((r) => ({
        _id: (r["_id"] as number) + src.idOffset,
        supplier: r[src.supplierCol] as string,
        numero: null,
        approval_date: r[src.dateCol] as string,
        service: r[src.serviceCol] as string,
        activite: null,
        montant: r[src.amountCol] ? parseFloat(r[src.amountCol] as string) : null,
        source: src.source,
        description: src.descCol ? (r[src.descCol] as string) : null,
      }));
      if (mapped.length > 0) {
        insertMany(mapped);
      }
      console.log(`   ${records.length} rows`);
      totalRows += records.length;
      await sleep(1000);
    }
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
