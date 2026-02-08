import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { RawPermit, RawContract } from "./types";

const DB_PATH = path.join(process.cwd(), "data", "montreal.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    if (!fs.existsSync(DB_PATH)) {
      throw new Error(
        `Database not found at ${DB_PATH}. Run 'npm run etl:full' first.`
      );
    }
    _db = new Database(DB_PATH, { readonly: true });
    _db.pragma("journal_mode = WAL");
  }
  return _db;
}

/**
 * Query permits for a given year.
 * Returns fields matching what data.ts expects from RawPermit.
 */
export function queryPermitsByYear(year: number): RawPermit[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT arrondissement, date_debut, date_emission
       FROM permits
       WHERE date_debut >= ? AND date_debut < ?
       ORDER BY date_debut DESC`
    )
    .all(`${year}-01-01`, `${year + 1}-01-01`) as RawPermit[];
}

/**
 * Query yearly permit trends using a single GROUP BY.
 * Replaces 11+ parallel CKAN API calls.
 */
export function queryYearlyTrends(
  startYear: number = 2015
): { year: number; totalPermits: number }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT CAST(substr(date_debut, 1, 4) AS INTEGER) AS year,
              COUNT(*) AS totalPermits
       FROM permits
       WHERE date_debut >= ?
         AND arrondissement IS NOT NULL
         AND arrondissement != ''
       GROUP BY substr(date_debut, 1, 4)
       ORDER BY year`
    )
    .all(`${startYear}-01-01`) as { year: number; totalPermits: number }[];
}

/**
 * Query contracts for a given year.
 * Uses column aliases to match RawContract French field names.
 */
export function queryContractsByYear(year: number): RawContract[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT
         supplier       AS "NOM DU FOURNISSEUR",
         numero         AS "NUMERO",
         approval_date  AS "DATE D'APPROBATION",
         service        AS "SERVICE",
         activite       AS "ACTIVITE",
         CAST(montant AS TEXT) AS "MONTANT"
       FROM contracts
       WHERE approval_date >= ? AND approval_date < ?
       ORDER BY approval_date DESC`
    )
    .all(`${year}-01-01`, `${year + 1}-01-01`) as RawContract[];
}

/**
 * Get the timestamp of the last successful ETL run for a dataset.
 */
export function getLastEtlRun(dataset: string): string | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT finished_at FROM etl_runs
       WHERE dataset = ? AND finished_at IS NOT NULL
       ORDER BY finished_at DESC LIMIT 1`
    )
    .get(dataset) as { finished_at: string } | undefined;
  return row?.finished_at ?? null;
}
