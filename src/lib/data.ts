import { cache } from "react";
import {
  queryPermitsByYear, queryYearlyTrends, queryPermitsForTrends, queryContractsByRange, getLastEtlRun,
  querySoleSourceByYear, querySoleSourceTopRecipients, queryYearlyContractsBySource,
  queryPromises, queryFirst100DaysPromises, queryBoroughPromises, queryPlatformPromises, queryLatestPromiseUpdates,
  queryPromiseStatusCounts, queryPromiseCategoryCounts, queryPromiseUpdateCounts,
} from "./db";
import { normalizeBoroughName, getBoroughSlug } from "./boroughs";
import { calculateBoroughScores, rankBoroughs, medianDaysToGrade, PERMIT_TARGET_DAYS } from "./scoring";
import { normalizeSupplierName } from "./supplier-normalization";
import type {
  BoroughPermitStats, BoroughScore, BoroughComparison, CitySummary, ContractStats,
  SoleSourceStats, YearlyContractTrend,
  CampaignPromise, PromiseUpdate, PromiseSummary, PromiseCategorySummary,
  PromiseStatus, PromiseSentiment, PromiseCategory,
} from "./types";

/** Compute median of a sorted number array */
function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Compute percentile from a sorted array */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
  return sorted[idx];
}

/** Calculate processing days from date strings */
function processingDays(dateDebut: string | null, dateEmission: string | null): number | null {
  if (!dateDebut || !dateEmission) return null;
  try {
    const d1 = new Date(dateDebut);
    const d2 = new Date(dateEmission);
    const days = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    return days >= 0 ? days : null;
  } catch {
    return null;
  }
}

/**
 * Get borough permit stats for a given year.
 * Computes stats for ALL permits and housing-only (nb_logements > 0) in one pass.
 * Wrapped with React cache() to deduplicate across components in the same request.
 */
export const getBoroughPermitStats = cache(async (year: number): Promise<BoroughPermitStats[]> => {
  const currentAll = queryPermitsByYear(year);
  const prevAll = queryPermitsByYear(year - 1);
  const currentHousing = queryPermitsByYear(year, { housingOnly: true });
  const prevHousing = queryPermitsByYear(year - 1, { housingOnly: true });

  function computeStats(permits: typeof currentAll) {
    const byBorough = new Map<string, { total: number; days: number[] }>();

    for (const p of permits) {
      if (!p.arrondissement) continue;
      const borough = normalizeBoroughName(p.arrondissement);
      if (!byBorough.has(borough)) {
        byBorough.set(borough, { total: 0, days: [] });
      }
      const b = byBorough.get(borough)!;
      b.total++;

      const d = processingDays(p.date_debut, p.date_emission);
      if (d !== null) {
        b.days.push(d);
      }
    }

    return byBorough;
  }

  const current = computeStats(currentAll);
  const prev = computeStats(prevAll);
  const currentH = computeStats(currentHousing);
  const prevH = computeStats(prevHousing);

  const stats: BoroughPermitStats[] = [];

  for (const [borough, data] of current) {
    const sorted = data.days.sort((a, b) => a - b);
    const med = median(sorted);
    const prevData = prev.get(borough);
    const prevMedian = prevData ? median(prevData.days.sort((a, b) => a - b)) : med;

    // Housing stats for this borough
    const hData = currentH.get(borough);
    const hSorted = hData ? hData.days.sort((a, b) => a - b) : [];
    const hMed = median(hSorted);
    const hPrev = prevH.get(borough);
    const hPrevMedian = hPrev ? median(hPrev.days.sort((a, b) => a - b)) : hMed;

    stats.push({
      borough,
      slug: getBoroughSlug(borough),
      total_permits: data.total,
      permits_issued: sorted.length,
      permits_pending: data.total - sorted.length,
      median_processing_days: med,
      avg_processing_days: sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
      p90_processing_days: percentile(sorted, 0.9),
      pct_within_90_days: sorted.length > 0 ? (sorted.filter((d) => d <= 90).length / sorted.length) * 100 : 0,
      pct_within_120_days: sorted.length > 0 ? (sorted.filter((d) => d <= 120).length / sorted.length) * 100 : 0,
      trend_vs_last_year: med - prevMedian,
      year,
      // Housing-only
      housing_permits: hData?.total ?? 0,
      housing_issued: hSorted.length,
      housing_median_days: hMed,
      housing_pct_within_90_days: hSorted.length > 0 ? (hSorted.filter((d) => d <= 90).length / hSorted.length) * 100 : 0,
      housing_trend_vs_last_year: hMed - hPrevMedian,
    });
  }

  return stats;
});

/**
 * Get ranked borough scores with grades.
 */
export async function getBoroughScores(year: number): Promise<BoroughScore[]> {
  const stats = await getBoroughPermitStats(year);
  const scores = calculateBoroughScores(stats);
  return rankBoroughs(scores);
}

/**
 * Get data formatted for the bar chart.
 * Uses housing-only median as the primary metric.
 */
export async function getBoroughComparisonData(year: number): Promise<BoroughComparison[]> {
  const stats = await getBoroughPermitStats(year);

  return stats
    .filter((s) => s.housing_permits > 0) // only boroughs with housing permits
    .map((s) => ({
      borough: s.borough,
      slug: s.slug,
      value: s.housing_median_days,
      target: PERMIT_TARGET_DAYS,
      grade: medianDaysToGrade(s.housing_median_days),
    }))
    .sort((a, b) => a.value - b.value);
}

/**
 * Get city-wide summary statistics.
 * Includes both all-permit and housing-only metrics.
 */
export async function getCitySummary(year: number): Promise<CitySummary> {
  const stats = await getBoroughPermitStats(year);

  if (stats.length === 0) {
    return {
      total_permits_ytd: 0,
      median_processing_days: 0,
      pct_within_target: 0,
      target_days: PERMIT_TARGET_DAYS,
      best_borough: "N/A",
      worst_borough: "N/A",
      trend_vs_last_year: 0,
      last_updated: getLastEtlRun("permits") ?? new Date().toISOString(),
      housing_permits_ytd: 0,
      housing_median_days: 0,
      housing_pct_within_target: 0,
    };
  }

  const allMedians = stats.map((s) => s.median_processing_days).filter((d) => d > 0);
  const cityMedian = median(allMedians.sort((a, b) => a - b));

  const totalPermits = stats.reduce((sum, s) => sum + s.total_permits, 0);
  const totalIssued = stats.reduce((sum, s) => sum + s.permits_issued, 0);

  const withinTarget = stats.reduce(
    (sum, s) => sum + (s.pct_within_90_days * s.permits_issued) / 100,
    0
  );
  const pctWithinTarget = totalIssued > 0 ? (withinTarget / totalIssued) * 100 : 0;

  const withHousing = stats.filter((s) => s.housing_issued > 0);
  const best = withHousing.length > 0
    ? withHousing.reduce((a, b) => a.housing_median_days < b.housing_median_days ? a : b)
    : stats[0];
  const worst = withHousing.length > 0
    ? withHousing.reduce((a, b) => a.housing_median_days > b.housing_median_days ? a : b)
    : stats[0];

  const avgTrend =
    stats.reduce((sum, s) => sum + s.trend_vs_last_year, 0) / stats.length;

  // Housing-only city-wide stats
  const housingTotal = stats.reduce((sum, s) => sum + s.housing_permits, 0);
  const housingMedians = stats.map((s) => s.housing_median_days).filter((d) => d > 0);
  const housingCityMedian = median(housingMedians.sort((a, b) => a - b));
  const housingIssued = stats.reduce((sum, s) => sum + s.housing_issued, 0);
  const housingWithinTarget = stats.reduce(
    (sum, s) => sum + (s.housing_pct_within_90_days * s.housing_issued) / 100,
    0
  );
  const housingPctWithin = housingIssued > 0 ? (housingWithinTarget / housingIssued) * 100 : 0;

  return {
    total_permits_ytd: totalPermits,
    median_processing_days: cityMedian,
    pct_within_target: pctWithinTarget,
    target_days: PERMIT_TARGET_DAYS,
    best_borough: best.borough,
    worst_borough: worst.borough,
    trend_vs_last_year: avgTrend,
    last_updated: getLastEtlRun("permits") ?? new Date().toISOString(),
    housing_permits_ytd: housingTotal,
    housing_median_days: housingCityMedian,
    housing_pct_within_target: housingPctWithin,
  };
}

/**
 * Get yearly trend data using per-year aggregation queries.
 */
export async function getYearlyTrendData() {
  return queryYearlyTrends(2015);
}

export type YearlyPermitTrend = { year: number; total: number; medianDays: number };

/**
 * Get yearly permit trends with median processing days.
 * Groups raw permits by year, computes processing days, calculates median.
 */
export function getYearlyPermitTrends(
  startYear: number = 2015,
  options?: { permitType?: string; housingOnly?: boolean }
): YearlyPermitTrend[] {
  const rows = queryPermitsForTrends(startYear, options);

  const byYear = new Map<number, { total: number; days: number[] }>();

  for (const row of rows) {
    const y = parseInt(row.year, 10);
    if (isNaN(y)) continue;

    if (!byYear.has(y)) byYear.set(y, { total: 0, days: [] });
    const bucket = byYear.get(y)!;
    bucket.total++;

    const d = processingDays(row.date_debut, row.date_emission);
    if (d !== null) bucket.days.push(d);
  }

  const result: YearlyPermitTrend[] = [];
  for (const [year, data] of byYear) {
    const sorted = data.days.sort((a, b) => a - b);
    result.push({ year, total: data.total, medianDays: median(sorted) });
  }

  return result.sort((a, b) => a.year - b.year);
}

// --- Contracts ---

/**
 * Get contract stats aggregated for a date range.
 * from/to are "YYYY-MM-DD" strings (to is exclusive).
 */
export const getContractStats = cache(async (from: string, to: string): Promise<ContractStats> => {
  const raw = queryContractsByRange(from, to);

  const amounts = raw
    .map((c) => parseFloat(c.MONTANT))
    .filter((n) => !isNaN(n));
  const sortedAmounts = [...amounts].sort((a, b) => a - b);
  const totalValue = amounts.reduce((sum, v) => sum + v, 0);

  // Top suppliers by total value (with name normalization)
  const supplierMap = new Map<string, { count: number; totalValue: number }>();
  for (const c of raw) {
    const rawName = c["NOM DU FOURNISSEUR"];
    const name = rawName ? normalizeSupplierName(rawName) : rawName;
    const amt = parseFloat(c.MONTANT) || 0;
    const existing = supplierMap.get(name) || { count: 0, totalValue: 0 };
    existing.count++;
    existing.totalValue += amt;
    supplierMap.set(name, existing);
  }
  const topSuppliers = [...supplierMap.entries()]
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 10);

  // Top departments by total value
  const deptMap = new Map<string, { count: number; totalValue: number }>();
  for (const c of raw) {
    const name = c.SERVICE;
    const amt = parseFloat(c.MONTANT) || 0;
    const existing = deptMap.get(name) || { count: 0, totalValue: 0 };
    existing.count++;
    existing.totalValue += amt;
    deptMap.set(name, existing);
  }
  const topDepartments = [...deptMap.entries()]
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 10);

  // Concentration: % of total spend by top 10 suppliers
  const top10Value = topSuppliers.reduce((sum, s) => sum + s.totalValue, 0);
  const top10ConcentrationPct = totalValue > 0 ? (top10Value / totalValue) * 100 : 0;

  // Distribution buckets (log-scale ranges for histogram)
  const buckets = [
    { label: "2K–5K", min: 2000, max: 5000 },
    { label: "5K–10K", min: 5000, max: 10000 },
    { label: "10K–25K", min: 10000, max: 25000 },
    { label: "25K–50K", min: 25000, max: 50000 },
    { label: "50K–100K", min: 50000, max: 100000 },
    { label: "100K–139K", min: 100000, max: 139000 },
    { label: "139K–250K", min: 139000, max: 250000 },
    { label: "250K–500K", min: 250000, max: 500000 },
    { label: "500K–1M", min: 500000, max: 1000000 },
    { label: "1M+", min: 1000000, max: Infinity },
  ];
  const distribution = buckets.map((b) => {
    const matching = amounts.filter((a) => a >= b.min && a < b.max);
    return {
      ...b,
      max: b.max === Infinity ? 999999999 : b.max,
      count: matching.length,
      totalValue: matching.reduce((sum, v) => sum + v, 0),
    };
  });

  // Threshold clustering: Quebec procurement thresholds
  // < $25K: no formal process required (art. 573.1 LCV)
  // $25K–threshold: invitation tender to 2+ suppliers
  // >= threshold: mandatory public call for tenders
  // Sources: Muni-Express bulletins, MAMH; C-19, r. 5

  function clusterAroundThreshold(
    amts: number[],
    threshold: number,
    bandSize: number,
  ) {
    const bandMin = threshold - bandSize;
    const bandMax = threshold;
    const inBand = amts.filter((a) => a >= bandMin && a < bandMax).length;
    const aboveBand = amts.filter((a) => a >= bandMax && a < bandMax + bandSize).length;
    return { count: inBand, expected: aboveBand };
  }

  // Historical public tender thresholds by effective date
  // Each entry: [effective_from, effective_to_exclusive, threshold, label, period_label, band_size]
  const THRESHOLD_ERAS: {
    from: string; to: string; threshold: number;
    label: string; period: string; bandSize: number;
  }[] = [
    { from: "2011-01-01", to: "2017-07-01", threshold: 25000, label: "$25K", period: "2011–2017", bandSize: 5000 },
    { from: "2017-07-01", to: "2019-08-01", threshold: 100000, label: "$100K", period: "2017–2019", bandSize: 10000 },
    { from: "2019-08-01", to: "2022-01-01", threshold: 101100, label: "$101.1K", period: "2019–2021", bandSize: 10000 },
    { from: "2022-01-01", to: "2022-10-07", threshold: 105700, label: "$105.7K", period: "Jan–Oct 2022", bandSize: 10000 },
    { from: "2022-10-07", to: "2024-01-01", threshold: 121200, label: "$121.2K", period: "2022–2023", bandSize: 12000 },
    { from: "2024-01-01", to: "2026-01-01", threshold: 133800, label: "$133.8K", period: "2024–2025", bandSize: 13800 },
    { from: "2026-01-01", to: "2028-01-01", threshold: 139000, label: "$139K", period: "2026–2027", bandSize: 14000 },
  ];

  // $25K threshold applies to all contracts regardless of era
  const thresholdClusters: {
    threshold: number; label: string; period: string;
    count: number; expected: number;
    belowThreshold: number; totalInEra: number;
  }[] = [
    {
      threshold: 25000,
      label: "$25K",
      period: "",
      ...clusterAroundThreshold(amounts, 25000, 5000),
      belowThreshold: amounts.filter((a) => a < 25000).length,
      totalInEra: amounts.length,
    },
  ];

  // For each threshold era that overlaps the selected date range,
  // filter contracts to that era and run clustering
  for (const era of THRESHOLD_ERAS) {
    // Skip eras that don't overlap with selected range
    if (era.to <= from || era.from >= to) continue;
    // Skip the pre-2017 $25K era (already covered above as the universal $25K check)
    if (era.threshold === 25000) continue;

    const eraAmounts = raw
      .filter((c) => {
        const d = c["DATE D'APPROBATION"];
        return d >= era.from && d < era.to;
      })
      .map((c) => parseFloat(c.MONTANT))
      .filter((n) => !isNaN(n));

    if (eraAmounts.length > 0) {
      thresholdClusters.push({
        threshold: era.threshold,
        label: era.label,
        period: era.period,
        ...clusterAroundThreshold(eraAmounts, era.threshold, era.bandSize),
        belowThreshold: eraAmounts.filter((a) => a < era.threshold).length,
        totalInEra: eraAmounts.length,
      });
    }
  }

  return {
    totalContracts: raw.length,
    totalValue,
    avgValue: amounts.length > 0 ? totalValue / amounts.length : 0,
    medianValue: median(sortedAmounts),
    topSuppliers,
    topDepartments,
    top10ConcentrationPct,
    distribution,
    thresholdClusters,
    from,
    to,
  };
});

/**
 * Get sole-source (gré à gré) contract statistics for a date range.
 */
export const getSoleSourceStats = cache(async (from: string, to: string): Promise<SoleSourceStats> => {
  const byYear = querySoleSourceByYear(from, to);
  const rawRecipients = querySoleSourceTopRecipients(from, to, 10);

  // Normalize recipient names and re-aggregate
  const recipientMap = new Map<string, { count: number; totalValue: number }>();
  for (const r of rawRecipients) {
    const name = normalizeSupplierName(r.supplier);
    const existing = recipientMap.get(name) || { count: 0, totalValue: 0 };
    existing.count += r.count;
    existing.totalValue += r.totalValue;
    recipientMap.set(name, existing);
  }
  const topRecipients = [...recipientMap.entries()]
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 10);

  const totalCount = byYear.reduce((sum, y) => sum + y.count, 0);
  const totalValue = byYear.reduce((sum, y) => sum + y.totalValue, 0);

  return { byYear, topRecipients, totalCount, totalValue };
});

/**
 * Get yearly contract spending by approval body (source).
 */
export const getYearlyContractTrends = cache(async (): Promise<YearlyContractTrend[]> => {
  const raw = queryYearlyContractsBySource(2015);

  // Pivot: group by year, columns by source
  const yearMap = new Map<string, YearlyContractTrend>();
  for (const r of raw) {
    // Skip junk year values (e.g. "CA24", "AUTO", "4573")
    if (!/^\d{4}$/.test(r.year) || parseInt(r.year) < 2011 || parseInt(r.year) > 2030) continue;
    if (!yearMap.has(r.year)) {
      yearMap.set(r.year, {
        year: r.year,
        fonctionnaires: 0,
        conseil_municipal: 0,
        conseil_agglomeration: 0,
        comite_executif: 0,
        conseils_arrondissement: 0,
        total: 0,
      });
    }
    const entry = yearMap.get(r.year)!;
    const key = r.source as keyof Omit<YearlyContractTrend, "year" | "total">;
    if (key in entry) {
      entry[key] = r.totalValue;
    }
    entry.total += r.totalValue;
  }

  return [...yearMap.values()].sort((a, b) => a.year.localeCompare(b.year));
});

// ---------------------------------------------------------------------------
// Promises
// ---------------------------------------------------------------------------

function toPromise(
  r: import("./types").RawPromise,
  latestUpdate: PromiseUpdate | null,
  updatesCount: number,
): CampaignPromise {
  return {
    id: r.id,
    category: r.category as PromiseCategory,
    subcategory: r.subcategory,
    borough: r.borough,
    text_fr: r.text_fr,
    text_en: r.text_en,
    measurable: r.measurable === 1,
    target_value: r.target_value,
    target_timeline: r.target_timeline,
    status: r.status as PromiseStatus,
    auto_trackable: r.auto_trackable === 1,
    data_source: r.data_source,
    first100Days: r.first_100_days === 1,
    latestUpdate,
    updatesCount,
  };
}

export const getPromises = cache(async (category?: string): Promise<CampaignPromise[]> => {
  const raw = queryPromises(category);
  const latestUpdates = queryLatestPromiseUpdates();
  const updateCounts = queryPromiseUpdateCounts();

  const updatesMap = new Map<string, PromiseUpdate>(
    latestUpdates.map((u) => [u.promise_id, {
      id: u.id, promise_id: u.promise_id, date: u.date,
      source_url: u.source_url, source_title: u.source_title,
      summary_fr: u.summary_fr, summary_en: u.summary_en,
      sentiment: u.sentiment as PromiseSentiment | null,
    }])
  );
  const countsMap = new Map(updateCounts.map((c) => [c.promise_id, c.count]));

  return raw.map((r) => toPromise(r, updatesMap.get(r.id) ?? null, countsMap.get(r.id) ?? 0));
});

export const getFirst100DaysPromises = cache(async (): Promise<CampaignPromise[]> => {
  const raw = queryFirst100DaysPromises();
  const latestUpdates = queryLatestPromiseUpdates();
  const updateCounts = queryPromiseUpdateCounts();

  const updatesMap = new Map<string, PromiseUpdate>(
    latestUpdates.map((u) => [u.promise_id, {
      id: u.id, promise_id: u.promise_id, date: u.date,
      source_url: u.source_url, source_title: u.source_title,
      summary_fr: u.summary_fr, summary_en: u.summary_en,
      sentiment: u.sentiment as PromiseSentiment | null,
    }])
  );
  const countsMap = new Map(updateCounts.map((c) => [c.promise_id, c.count]));

  return raw.map((r) => toPromise(r, updatesMap.get(r.id) ?? null, countsMap.get(r.id) ?? 0));
});

export const getPromiseSummary = cache(async (): Promise<PromiseSummary> => {
  const rows = queryPromiseStatusCounts();
  let total = 0, not_started = 0, in_progress = 0, completed = 0, broken = 0, partially_met = 0;
  let measurable_total = 0, measurable_completed = 0;

  for (const r of rows) {
    total += r.count;
    measurable_total += r.measurable;
    switch (r.status) {
      case "not_started": not_started = r.count; break;
      case "in_progress": in_progress = r.count; break;
      case "completed": completed = r.count; measurable_completed = r.measurable; break;
      case "broken": broken = r.count; break;
      case "partially_met": partially_met = r.count; break;
    }
  }

  return {
    total, not_started, in_progress, completed, broken, partially_met,
    pct_completed: total > 0 ? (completed / total) * 100 : 0,
    pct_in_progress: total > 0 ? (in_progress / total) * 100 : 0,
    pct_broken: total > 0 ? (broken / total) * 100 : 0,
    measurable_total, measurable_completed,
  };
});

export const getPromisesByBorough = cache(async (): Promise<Map<string, CampaignPromise[]>> => {
  const raw = queryBoroughPromises();
  const latestUpdates = queryLatestPromiseUpdates();
  const updateCounts = queryPromiseUpdateCounts();

  const updatesMap = new Map<string, PromiseUpdate>(
    latestUpdates.map((u) => [u.promise_id, {
      id: u.id, promise_id: u.promise_id, date: u.date,
      source_url: u.source_url, source_title: u.source_title,
      summary_fr: u.summary_fr, summary_en: u.summary_en,
      sentiment: u.sentiment as PromiseSentiment | null,
    }])
  );
  const countsMap = new Map(updateCounts.map((c) => [c.promise_id, c.count]));

  const byBorough = new Map<string, CampaignPromise[]>();
  for (const r of raw) {
    const p = toPromise(r, updatesMap.get(r.id) ?? null, countsMap.get(r.id) ?? 0);
    const list = byBorough.get(r.borough!) ?? [];
    list.push(p);
    byBorough.set(r.borough!, list);
  }
  return byBorough;
});

export const getPlatformPromisesByCategory = cache(async (): Promise<Map<string, CampaignPromise[]>> => {
  const raw = queryPlatformPromises();
  const latestUpdates = queryLatestPromiseUpdates();
  const updateCounts = queryPromiseUpdateCounts();

  const updatesMap = new Map<string, PromiseUpdate>(
    latestUpdates.map((u) => [u.promise_id, {
      id: u.id, promise_id: u.promise_id, date: u.date,
      source_url: u.source_url, source_title: u.source_title,
      summary_fr: u.summary_fr, summary_en: u.summary_en,
      sentiment: u.sentiment as PromiseSentiment | null,
    }])
  );
  const countsMap = new Map(updateCounts.map((c) => [c.promise_id, c.count]));

  const byCategory = new Map<string, CampaignPromise[]>();
  for (const r of raw) {
    const p = toPromise(r, updatesMap.get(r.id) ?? null, countsMap.get(r.id) ?? 0);
    const list = byCategory.get(r.category) ?? [];
    list.push(p);
    byCategory.set(r.category, list);
  }
  return byCategory;
});

export const getPromiseCategorySummaries = cache(async (): Promise<PromiseCategorySummary[]> => {
  const raw = queryPromiseCategoryCounts();
  return raw.map((r) => ({
    category: r.category as PromiseCategory,
    total: r.total,
    completed: r.completed,
    in_progress: r.in_progress,
    broken: r.broken,
  }));
});
