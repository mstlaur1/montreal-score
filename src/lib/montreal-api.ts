import type { RawPermit, RawContract } from "./types";

const API_BASE = "https://data.montreal.ca/api/3/action";
const PERMITS_RESOURCE_ID = "5232a72d-235a-48eb-ae20-bb9d501300ad";

/**
 * Fetch permits from Montreal's CKAN API using SQL queries.
 * Only selects the 3 columns needed for stats computation to keep payloads small.
 */
export async function fetchPermitsByYear(year: number): Promise<RawPermit[]> {
  const sql = `
    SELECT "arrondissement", "date_debut", "date_emission"
    FROM "${PERMITS_RESOURCE_ID}"
    WHERE "date_debut" >= '${year}-01-01'
      AND "date_debut" < '${year + 1}-01-01'
    ORDER BY "date_debut" DESC
  `;

  const url = `${API_BASE}/datastore_search_sql?sql=${encodeURIComponent(sql)}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Montreal API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(`Montreal API returned error: ${JSON.stringify(data.error)}`);
  }

  return data.result.records as RawPermit[];
}

/**
 * Fetch permit count for a single year using COUNT aggregation.
 */
async function fetchYearCount(year: number): Promise<{ year: number; totalPermits: number } | null> {
  const sql = `
    SELECT COUNT(*) as total
    FROM "${PERMITS_RESOURCE_ID}"
    WHERE "date_debut" >= '${year}-01-01'
      AND "date_debut" < '${year + 1}-01-01'
      AND "arrondissement" IS NOT NULL
      AND "arrondissement" != ''
  `;

  const url = `${API_BASE}/datastore_search_sql?sql=${encodeURIComponent(sql)}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;

  const data = await response.json();
  if (!data.success || !data.result.records.length) return null;

  return {
    year,
    totalPermits: parseInt(data.result.records[0].total) || 0,
  };
}

/**
 * Fetch yearly permit trends using parallel COUNT queries.
 * Returns total permits per year for the last N years.
 */
export async function fetchYearlyTrends(startYear: number = 2018) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - startYear + 1 }, (_, i) => startYear + i);

  const results = await Promise.allSettled(years.map(fetchYearCount));

  return results
    .filter((r): r is PromiseFulfilledResult<{ year: number; totalPermits: number } | null> =>
      r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value!)
    .sort((a, b) => a.year - b.year);
}

// --- Contracts ---

const CONTRACTS_RESOURCE_ID = "e4b758ab-3edb-4b6a-8764-2a443b6b9404";

/**
 * Fetch contracts from Montreal's CKAN API for a given year.
 * Selects only the columns needed to keep payloads manageable.
 */
export async function fetchContractsByYear(year: number): Promise<RawContract[]> {
  const sql = `
    SELECT "NOM DU FOURNISSEUR", "NUMERO", "DATE D'APPROBATION", "SERVICE", "ACTIVITE", "MONTANT"
    FROM "${CONTRACTS_RESOURCE_ID}"
    WHERE "DATE D'APPROBATION" >= '${year}-01-01'
      AND "DATE D'APPROBATION" < '${year + 1}-01-01'
    ORDER BY "DATE D'APPROBATION" DESC
  `;

  const url = `${API_BASE}/datastore_search_sql?sql=${encodeURIComponent(sql)}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Montreal API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(`Montreal API returned error: ${JSON.stringify(data.error)}`);
  }

  return data.result.records as RawContract[];
}

/**
 * Fetch contract count for a single year.
 */
export async function fetchContractCount(year: number): Promise<{ year: number; total: number } | null> {
  const sql = `
    SELECT COUNT(*) as total
    FROM "${CONTRACTS_RESOURCE_ID}"
    WHERE "DATE D'APPROBATION" >= '${year}-01-01'
      AND "DATE D'APPROBATION" < '${year + 1}-01-01'
  `;

  const url = `${API_BASE}/datastore_search_sql?sql=${encodeURIComponent(sql)}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;

  const data = await response.json();
  if (!data.success || !data.result.records.length) return null;

  return {
    year,
    total: parseInt(data.result.records[0].total) || 0,
  };
}
