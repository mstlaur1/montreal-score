import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { RawPermit, RawContract, RawPromise, RawPromiseUpdate } from "./types";

const DB_PATH = path.join(process.cwd(), "data", "montreal.db");

let _db: Database.Database | null = null;
let _hasFts: boolean | null = null;
let _hasFtsCheckedAt = 0;
const FTS_CHECK_INTERVAL_MS = 5 * 60 * 1000; // Re-check every 5 minutes

function getDb(): Database.Database {
  if (!_db) {
    if (!fs.existsSync(DB_PATH)) {
      throw new Error(
        `Database not found at ${DB_PATH}. Run 'npm run etl:full' first.`
      );
    }
    _db = new Database(DB_PATH, { readonly: true });
    _db.pragma("busy_timeout = 5000");
  }
  return _db;
}

/** Check whether the FTS5 index exists, re-checking periodically. */
function hasFts(): boolean {
  const now = Date.now();
  if (_hasFts === null || now - _hasFtsCheckedAt > FTS_CHECK_INTERVAL_MS) {
    const db = getDb();
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contracts_fts'").get();
    _hasFts = !!row;
    _hasFtsCheckedAt = now;
  }
  return _hasFts;
}

/**
 * Convert a user search query to an FTS5 MATCH expression.
 * Each word becomes a prefix token: "pomerleau inc" → "pomerleau* inc*"
 * Special FTS5 characters are stripped to prevent syntax errors.
 */
function toFtsQuery(query: string): string | null {
  const expr = query
    .replace(/[":(){}*^~\-+|]/g, " ")  // strip FTS5 special chars
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `"${w}"*`)
    .join(" ");
  return expr || null;
}

/**
 * Query permits for a given year.
 * When housingOnly is true, filters to permits with nb_logements > 0
 * (i.e. projects that add dwelling units — the ones subject to the 90-day target).
 */
export function queryPermitsByYear(
  year: number,
  options?: { housingOnly?: boolean }
): RawPermit[] {
  const db = getDb();
  const housingFilter = options?.housingOnly
    ? ` AND nb_logements IS NOT NULL AND nb_logements != '' AND CAST(nb_logements AS INTEGER) > 0`
    : "";
  return db
    .prepare(
      `SELECT arrondissement, date_debut, date_emission, permit_type, nb_logements
       FROM permits
       WHERE date_debut >= ? AND date_debut < ?${housingFilter}
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
 * Query raw permit rows for trend computation.
 * Returns date_debut and date_emission so median processing days can be
 * calculated in the data layer (SQLite has no PERCENTILE).
 */
export function queryPermitsForTrends(
  startYear: number = 2015,
  options?: { permitType?: string; housingOnly?: boolean }
): { year: string; date_debut: string | null; date_emission: string | null }[] {
  const db = getDb();
  const conditions = [`date_debut >= ?`];
  const params: (string | number)[] = [`${startYear}-01-01`];

  if (options?.permitType) {
    conditions.push(`permit_type = ?`);
    params.push(options.permitType);
  }
  if (options?.housingOnly) {
    conditions.push(`nb_logements IS NOT NULL AND nb_logements != '' AND CAST(nb_logements AS INTEGER) > 0`);
  }

  return db
    .prepare(
      `SELECT substr(date_debut, 1, 4) AS year, date_debut, date_emission
       FROM permits
       WHERE ${conditions.join(" AND ")}
       ORDER BY date_debut`
    )
    .all(...params) as { year: string; date_debut: string | null; date_emission: string | null }[];
}

/**
 * Query ALL raw permit rows for trend computation in a single pass.
 * Returns permit_type and nb_logements so the data layer can bucket
 * into filter variants (all, housing, TR, CO, DE, CA) without re-querying.
 */
export function queryAllPermitsForTrends(
  startYear: number = 2015
): { year: string; date_debut: string | null; date_emission: string | null; permit_type: string | null; nb_logements: number | null }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT substr(date_debut, 1, 4) AS year, date_debut, date_emission, permit_type, nb_logements
       FROM permits
       WHERE date_debut >= ?
       ORDER BY date_debut`
    )
    .all(`${startYear}-01-01`) as { year: string; date_debut: string | null; date_emission: string | null; permit_type: string | null; nb_logements: number | null }[];
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
         AND approval_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
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
       WHERE approval_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'`
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

export function getLatestEtlRun(): string | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT finished_at FROM etl_runs
       WHERE finished_at IS NOT NULL
       ORDER BY finished_at DESC LIMIT 1`
    )
    .get() as { finished_at: string } | undefined;
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

export function queryPlatformPromises(): RawPromise[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM promises WHERE borough IS NULL AND first_100_days = 0 ORDER BY category, id")
    .all() as RawPromise[];
}

export function queryNeedsHelpPromises(): RawPromise[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM promises WHERE needs_help = 1 ORDER BY category, id")
    .all() as RawPromise[];
}

export function queryNeedsHelpCount(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) AS n FROM promises WHERE needs_help = 1").get() as { n: number };
  return row.n;
}

export function queryPromiseUpdateCounts(): { promise_id: string; count: number }[] {
  const db = getDb();
  return db
    .prepare("SELECT promise_id, COUNT(*) AS count FROM promise_updates GROUP BY promise_id")
    .all() as { promise_id: string; count: number }[];
}

/**
 * Query contracts in a specific amount band within a date range.
 * Returns supplier, approval_date, montant for split-detection analysis.
 * Same intergovernmental + ISO date filters as queryContractsByRange.
 */
export function queryContractsInBand(
  from: string,
  to: string,
  bandMin: number,
  bandMax: number,
): { supplier: string; approval_date: string; montant: number }[] {
  const db = getDb();
  const placeholders = INTERGOVERNMENTAL_SUPPLIERS.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT supplier, approval_date, CAST(montant AS REAL) AS montant
       FROM contracts
       WHERE approval_date >= ? AND approval_date < ?
         AND approval_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
         AND CAST(montant AS REAL) >= ? AND CAST(montant AS REAL) < ?
         AND supplier NOT IN (${placeholders})
       ORDER BY supplier, approval_date`
    )
    .all(from, to, bandMin, bandMax, ...INTERGOVERNMENTAL_SUPPLIERS) as {
      supplier: string; approval_date: string; montant: number;
    }[];
}

// --- Contract forensics ---

/**
 * Sole-source (gré à gré) contracts grouped by year.
 * Matches "GRÉ À GRÉ" in the description field (council/committee datasets).
 */
export function querySoleSourceByYear(from: string, to: string): {
  year: string; count: number; totalValue: number;
}[] {
  const db = getDb();
  const placeholders = INTERGOVERNMENTAL_SUPPLIERS.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT substr(approval_date, 1, 4) AS year,
              COUNT(*) AS count,
              SUM(montant) AS totalValue
       FROM contracts
       WHERE approval_date >= ? AND approval_date < ?
         AND (UPPER(description) LIKE '%GRÉ À GRÉ%' OR UPPER(description) LIKE '%GRE A GRE%')
         AND supplier NOT IN (${placeholders})
       GROUP BY year ORDER BY year`
    )
    .all(from, to, ...INTERGOVERNMENTAL_SUPPLIERS) as {
      year: string; count: number; totalValue: number;
    }[];
}

/**
 * Top sole-source contract recipients by total value.
 */
export function querySoleSourceTopRecipients(from: string, to: string, limit = 10): {
  supplier: string; count: number; totalValue: number;
}[] {
  const db = getDb();
  const placeholders = INTERGOVERNMENTAL_SUPPLIERS.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT supplier, COUNT(*) AS count, SUM(montant) AS totalValue
       FROM contracts
       WHERE approval_date >= ? AND approval_date < ?
         AND (UPPER(description) LIKE '%GRÉ À GRÉ%' OR UPPER(description) LIKE '%GRE A GRE%')
         AND supplier NOT IN (${placeholders})
         AND supplier IS NOT NULL
       GROUP BY supplier ORDER BY totalValue DESC LIMIT ?`
    )
    .all(from, to, ...INTERGOVERNMENTAL_SUPPLIERS, limit) as {
      supplier: string; count: number; totalValue: number;
    }[];
}

/**
 * Yearly contract totals grouped by approval source (body).
 */
// --- Contract forensics: new analyses ---

/**
 * Round-number clustering: contracts at suspicious exact amounts near procurement thresholds.
 * Queries contracts whose integer amount matches a list of round numbers.
 */
export function queryRoundNumberContracts(from: string, to: string, amounts: number[]): {
  amount: number; count: number;
}[] {
  if (amounts.length === 0) return [];
  const db = getDb();
  const placeholders = INTERGOVERNMENTAL_SUPPLIERS.map(() => "?").join(",");
  const amtPlaceholders = amounts.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT CAST(montant AS INTEGER) AS amount, COUNT(*) AS count
       FROM contracts
       WHERE approval_date >= ? AND approval_date < ?
         AND approval_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
         AND CAST(montant AS INTEGER) IN (${amtPlaceholders})
         AND supplier NOT IN (${placeholders})
       GROUP BY CAST(montant AS INTEGER)
       ORDER BY amount DESC`
    )
    .all(from, to, ...amounts, ...INTERGOVERNMENTAL_SUPPLIERS) as { amount: number; count: number }[];
}

/**
 * Count contracts in a comparison band above a threshold for asymmetry analysis.
 */
export function queryComparisonBandCount(from: string, to: string, bandMin: number, bandMax: number): number {
  const db = getDb();
  const placeholders = INTERGOVERNMENTAL_SUPPLIERS.map(() => "?").join(",");
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM contracts
       WHERE approval_date >= ? AND approval_date < ?
         AND approval_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
         AND CAST(montant AS REAL) > ? AND CAST(montant AS REAL) <= ?
         AND supplier NOT IN (${placeholders})`
    )
    .get(from, to, bandMin, bandMax, ...INTERGOVERNMENTAL_SUPPLIERS) as { count: number };
  return row.count;
}

/**
 * Monthly distribution of contracts for year-end spending analysis.
 */
export function queryMonthlyDistribution(from: string, to: string): {
  month: number; count: number; totalValue: number;
}[] {
  const db = getDb();
  const placeholders = INTERGOVERNMENTAL_SUPPLIERS.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT CAST(substr(approval_date, 6, 2) AS INTEGER) AS month,
              COUNT(*) AS count,
              SUM(montant) AS totalValue
       FROM contracts
       WHERE approval_date >= ? AND approval_date < ?
         AND approval_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
         AND supplier NOT IN (${placeholders})
       GROUP BY CAST(substr(approval_date, 6, 2) AS INTEGER)
       ORDER BY month`
    )
    .all(from, to, ...INTERGOVERNMENTAL_SUPPLIERS) as { month: number; count: number; totalValue: number }[];
}

/**
 * Department-supplier pairs by total value.
 */
export function queryDeptSupplierPairs(from: string, to: string): {
  service: string; supplier: string; count: number; totalValue: number;
}[] {
  const db = getDb();
  const placeholders = INTERGOVERNMENTAL_SUPPLIERS.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT service, supplier, COUNT(*) AS count, SUM(montant) AS totalValue
       FROM contracts
       WHERE approval_date >= ? AND approval_date < ?
         AND approval_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
         AND supplier NOT IN (${placeholders})
         AND service IS NOT NULL AND supplier IS NOT NULL
       GROUP BY service, supplier
       ORDER BY totalValue DESC
       LIMIT 50`
    )
    .all(from, to, ...INTERGOVERNMENTAL_SUPPLIERS) as {
      service: string; supplier: string; count: number; totalValue: number;
    }[];
}

/**
 * Department totals for computing % of department spend.
 */
export function queryDeptTotals(from: string, to: string): {
  service: string; totalValue: number;
}[] {
  const db = getDb();
  const placeholders = INTERGOVERNMENTAL_SUPPLIERS.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT service, SUM(montant) AS totalValue
       FROM contracts
       WHERE approval_date >= ? AND approval_date < ?
         AND approval_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
         AND supplier NOT IN (${placeholders})
         AND service IS NOT NULL
       GROUP BY service`
    )
    .all(from, to, ...INTERGOVERNMENTAL_SUPPLIERS) as { service: string; totalValue: number }[];
}

/**
 * Supplier totals split by half-period for growth trajectory analysis.
 */
export function querySupplierHalfPeriodTotals(from: string, to: string, midpoint: string): {
  supplier: string; half: number; totalValue: number;
}[] {
  const db = getDb();
  const placeholders = INTERGOVERNMENTAL_SUPPLIERS.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT supplier,
              CASE WHEN approval_date < ? THEN 1 ELSE 2 END AS half,
              SUM(montant) AS totalValue
       FROM contracts
       WHERE approval_date >= ? AND approval_date < ?
         AND approval_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
         AND supplier NOT IN (${placeholders})
         AND supplier IS NOT NULL
       GROUP BY supplier, CASE WHEN approval_date < ? THEN 1 ELSE 2 END`
    )
    .all(midpoint, from, to, ...INTERGOVERNMENTAL_SUPPLIERS, midpoint) as {
      supplier: string; half: number; totalValue: number;
    }[];
}

/**
 * Search contracts by keyword across supplier, service, and description,
 * and/or by contract value (montant) range.
 */
const SORT_MAP: Record<string, string> = {
  date_asc: "approval_date ASC",
  date_desc: "approval_date DESC",
  supplier_asc: "supplier COLLATE NOCASE ASC",
  supplier_desc: "supplier COLLATE NOCASE DESC",
  service_asc: "service COLLATE NOCASE ASC",
  service_desc: "service COLLATE NOCASE DESC",
  amount_asc: "CAST(montant AS REAL) ASC",
  amount_desc: "CAST(montant AS REAL) DESC",
};

export function searchContracts(
  from: string, to: string, query: string, limit: number, offset: number,
  amountFilter?: { min?: number; max?: number }, sort?: string
): { results: { supplier: string; service: string; description: string; montant: number; approval_date: string; source: string }[]; totalCount: number } {
  const db = getDb();
  const placeholders = INTERGOVERNMENTAL_SUPPLIERS.map(() => "?").join(",");

  const conditions: string[] = [
    `approval_date >= ?`,
    `approval_date < ?`,
    `approval_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'`,
    `supplier NOT IN (${placeholders})`,
  ];
  const params: (string | number)[] = [from, to, ...INTERGOVERNMENTAL_SUPPLIERS];

  if (query) {
    if (hasFts()) {
      // Use FTS5 index for fast text search
      const ftsExpr = toFtsQuery(query);
      if (!ftsExpr) {
        // Query was all special characters — return no results
        return { results: [], totalCount: 0 };
      }
      conditions.push(`rowid IN (SELECT rowid FROM contracts_fts WHERE contracts_fts MATCH ?)`);
      params.push(ftsExpr);
    } else {
      // Fallback to LIKE scan if FTS index not built
      const escaped = query.replace(/[%_]/g, (c) => `\\${c}`);
      const likePattern = `%${escaped}%`;
      conditions.push(`(supplier LIKE ? ESCAPE '\\' COLLATE NOCASE OR service LIKE ? ESCAPE '\\' COLLATE NOCASE OR description LIKE ? ESCAPE '\\' COLLATE NOCASE)`);
      params.push(likePattern, likePattern, likePattern);
    }
  }

  if (amountFilter?.min != null) {
    conditions.push(`CAST(montant AS REAL) >= ?`);
    params.push(amountFilter.min);
  }
  if (amountFilter?.max != null) {
    conditions.push(`CAST(montant AS REAL) <= ?`);
    params.push(amountFilter.max);
  }

  const whereClause = conditions.join(" AND ");
  const defaultOrder = amountFilter ? "CAST(montant AS REAL) DESC, approval_date DESC" : "approval_date DESC";
  const orderBy = (sort && SORT_MAP[sort]) || defaultOrder;

  const countRow = db
    .prepare(`SELECT COUNT(*) AS count FROM contracts WHERE ${whereClause}`)
    .get(...params) as { count: number };

  const results = db
    .prepare(
      `SELECT supplier, service, description, CAST(montant AS REAL) AS montant, approval_date, source
       FROM contracts WHERE ${whereClause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as {
      supplier: string; service: string; description: string; montant: number; approval_date: string; source: string;
    }[];

  return { results, totalCount: countRow.count };
}

// --- 311 Service Requests ---

export function querySRMonthlyVolume(): {
  year_month: string; nature: string; count: number;
}[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT year_month, nature, count
       FROM sr_monthly
       ORDER BY year_month`
    )
    .all() as { year_month: string; nature: string; count: number }[];
}

export function querySRBoroughStats(year?: number): {
  year: number; borough: string; total_count: number;
  completed_count: number; avg_response_days: number | null;
}[] {
  const db = getDb();
  if (year) {
    return db
      .prepare(
        `SELECT year, borough, total_count, completed_count, avg_response_days
         FROM sr_borough WHERE year = ?
         ORDER BY total_count DESC`
      )
      .all(year) as { year: number; borough: string; total_count: number; completed_count: number; avg_response_days: number | null }[];
  }
  return db
    .prepare(
      `SELECT year, borough, total_count, completed_count, avg_response_days
       FROM sr_borough
       ORDER BY year, total_count DESC`
    )
    .all() as { year: number; borough: string; total_count: number; completed_count: number; avg_response_days: number | null }[];
}

export function querySRCategories(year: number, limit = 20): {
  category: string; count: number;
}[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT category, count
       FROM sr_category WHERE year = ?
       ORDER BY count DESC LIMIT ?`
    )
    .all(year, limit) as { category: string; count: number }[];
}

export function querySRChannels(year: number): {
  channel: string; count: number;
}[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT channel, count
       FROM sr_channel WHERE year = ?
       ORDER BY count DESC`
    )
    .all(year) as { channel: string; count: number }[];
}

export function querySRStatuses(year: number): {
  status: string; count: number;
}[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT status, count
       FROM sr_status WHERE year = ?
       ORDER BY count DESC`
    )
    .all(year) as { status: string; count: number }[];
}

export function querySRYearRange(): { min: number; max: number } | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT MIN(year) AS min, MAX(year) AS max FROM sr_borough`
    )
    .get() as { min: number | null; max: number | null } | undefined;
  if (!row || row.min === null) return null;
  return { min: row.min, max: row.max! };
}

export function queryYearlyContractsBySource(startYear = 2015): {
  source: string; year: string; count: number; totalValue: number;
}[] {
  const db = getDb();
  const placeholders = INTERGOVERNMENTAL_SUPPLIERS.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT source, substr(approval_date, 1, 4) AS year,
              COUNT(*) AS count, SUM(montant) AS totalValue
       FROM contracts
       WHERE approval_date >= ?
         AND source IS NOT NULL
         AND supplier NOT IN (${placeholders})
       GROUP BY source, year ORDER BY source, year`
    )
    .all(`${startYear}-01-01`, ...INTERGOVERNMENTAL_SUPPLIERS) as {
      source: string; year: string; count: number; totalValue: number;
    }[];
}
