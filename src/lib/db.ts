import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { RawPermit, RawContract, RawPromise, RawPromiseUpdate } from "./types";

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
 * Intergovernmental / institutional suppliers that are budget transfers,
 * not procurement contracts. Excluded from analysis by default.
 */
const INTERGOVERNMENTAL_SUPPLIERS = [
  "AUTORITE REGIONALE DE TRANSPORT METROPOLITAIN",
  "SOCIETE DE TRANSPORT DE MONTREAL (STM)",
  "TRUST ROYAL DU CANADA",
  "SOCIETE DU PARC JEAN-DRAPEAU",
  "COMMUNAUTE METROPOLITAINE DE MONTREAL",
  "COMMISSION DE LA CAISSE COMMUNE",
  "RESEAU DE TRANSPORT METROPOLITAIN",
  "CONSEIL DES ARTS DE MONTREAL",
  "(ABRPPVM) ASSOCIATION BIENFAISANCE ET RETRAITE DES POLICIERS",
  "CAISSE COMMUNE RETRAITE VILLE DE MONTREAL",
  "SYNDICAT DES FONCTIONNAIRES MUNICIPAUX DE MONTREAL",
  "SYNDICAT DES COLS BLEUS REGROUPES DE MONTREAL S.C.F.P. 301 / F.T.Q.",
  "ECOLE NATIONALE DE POLICE DU QUEBEC",
  "ASSOCIATION DES POMPIERS DE MONTREAL",
  "SOCIETE DE L'ASSURANCE AUTOMOBILE DU QUEBEC (S.A.A.Q.)",
];

/**
 * Query contracts within a date range.
 * from/to are "YYYY-MM-DD" strings (to is exclusive).
 * Excludes intergovernmental transfers by default.
 */
export function queryContractsByRange(from: string, to: string): RawContract[] {
  const db = getDb();
  const placeholders = INTERGOVERNMENTAL_SUPPLIERS.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT
         supplier       AS "NOM DU FOURNISSEUR",
         numero         AS "NUMERO",
         approval_date  AS "DATE D'APPROBATION",
         service        AS "SERVICE",
         activite       AS "ACTIVITE",
         CAST(montant AS TEXT) AS "MONTANT",
         source         AS "SOURCE"
       FROM contracts
       WHERE approval_date >= ? AND approval_date < ?
         AND supplier NOT IN (${placeholders})
       ORDER BY approval_date DESC`
    )
    .all(from, to, ...INTERGOVERNMENTAL_SUPPLIERS) as RawContract[];
}

/**
 * Get the earliest and latest month with contract data.
 * Returns { min: "2011-01", max: "2026-02" }.
 */
export function getContractDateBounds(): { min: string; max: string } {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         MIN(substr(approval_date, 1, 7)) AS min,
         MAX(substr(approval_date, 1, 7)) AS max
       FROM contracts
       WHERE approval_date IS NOT NULL`
    )
    .get() as { min: string; max: string };
  return row;
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

// --- Promises ---

export function queryPromises(category?: string): RawPromise[] {
  const db = getDb();
  if (category) {
    return db
      .prepare("SELECT * FROM promises WHERE category = ? ORDER BY id")
      .all(category) as RawPromise[];
  }
  return db
    .prepare("SELECT * FROM promises ORDER BY category, id")
    .all() as RawPromise[];
}

export function queryFirst100DaysPromises(): RawPromise[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM promises WHERE first_100_days = 1 ORDER BY id")
    .all() as RawPromise[];
}

export function queryLatestPromiseUpdates(): RawPromiseUpdate[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT pu.*
       FROM promise_updates pu
       INNER JOIN (
         SELECT promise_id, MAX(date) AS max_date
         FROM promise_updates GROUP BY promise_id
       ) latest ON pu.promise_id = latest.promise_id AND pu.date = latest.max_date
       ORDER BY pu.promise_id`
    )
    .all() as RawPromiseUpdate[];
}

export function queryPromiseUpdates(promiseId: string): RawPromiseUpdate[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM promise_updates WHERE promise_id = ? ORDER BY date DESC")
    .all(promiseId) as RawPromiseUpdate[];
}

export function queryPromiseStatusCounts(): { status: string; count: number; measurable: number }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT status, COUNT(*) AS count, SUM(measurable) AS measurable
       FROM promises GROUP BY status`
    )
    .all() as { status: string; count: number; measurable: number }[];
}

export function queryPromiseCategoryCounts(): {
  category: string; total: number; completed: number; in_progress: number; broken: number;
}[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT category, COUNT(*) AS total,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
              SUM(CASE WHEN status = 'broken' THEN 1 ELSE 0 END) AS broken
       FROM promises GROUP BY category ORDER BY category`
    )
    .all() as { category: string; total: number; completed: number; in_progress: number; broken: number }[];
}

export function queryBoroughPromises(): RawPromise[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM promises WHERE borough IS NOT NULL ORDER BY borough, id")
    .all() as RawPromise[];
}

export function queryPromiseUpdateCounts(): { promise_id: string; count: number }[] {
  const db = getDb();
  return db
    .prepare("SELECT promise_id, COUNT(*) AS count FROM promise_updates GROUP BY promise_id")
    .all() as { promise_id: string; count: number }[];
}
