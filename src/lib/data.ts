import { cache } from "react";
import {
  queryPermitsByYear, queryYearlyTrends, queryPermitsForTrends, queryContractsByRange, queryContractsInBand, getLastEtlRun,
  querySoleSourceByYear, querySoleSourceTopRecipients, queryYearlyContractsBySource,
  queryRoundNumberContracts, queryComparisonBandCount, queryMonthlyDistribution as queryMonthlyDistributionDb,
  queryDeptSupplierPairs, queryDeptTotals, querySupplierHalfPeriodTotals, searchContracts,
  queryPromises, queryFirst100DaysPromises, queryBoroughPromises, queryPlatformPromises, queryLatestPromiseUpdates,
  queryPromiseStatusCounts, queryPromiseCategoryCounts, queryPromiseUpdateCounts, queryNeedsHelpPromises, queryNeedsHelpCount,
} from "./db";
import { normalizeBoroughName, getBoroughSlug } from "./boroughs";
import { calculateBoroughScores, rankBoroughs, medianDaysToGrade, PERMIT_TARGET_DAYS } from "./scoring";
import { normalizeSupplierName } from "./supplier-normalization";
import type {
  BoroughPermitStats, BoroughScore, BoroughComparison, CitySummary, ContractStats, SplitCandidate,
  SoleSourceStats, YearlyContractTrend, MonthlySpending, DeptSupplierPair, SupplierGrowth, SupplierGrowthResult, ContractSearchResult,
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
 * Detect potential contract splitting: suppliers with multiple contracts
 * just below the $25K formal process threshold, dated close together.
 */
function detectContractSplitting(from: string, to: string): SplitCandidate[] {
  const bandContracts = queryContractsInBand(from, to, 15000, 25000);

  // Group by normalized supplier
  const bySupplier = new Map<string, { date: string; amount: number }[]>();
  for (const c of bandContracts) {
    if (!c.supplier) continue;
    const name = normalizeSupplierName(c.supplier);
    const list = bySupplier.get(name) ?? [];
    list.push({ date: c.approval_date, amount: c.montant });
    bySupplier.set(name, list);
  }

  const candidates: SplitCandidate[] = [];

  for (const [supplier, contracts] of bySupplier) {
    if (contracts.length < 2) continue;

    // Sort by date
    contracts.sort((a, b) => a.date.localeCompare(b.date));

    // Find temporal clusters: contracts within 90 days of each other
    const clusters: typeof contracts[] = [];
    let current = [contracts[0]];

    for (let i = 1; i < contracts.length; i++) {
      const prevDate = new Date(current[current.length - 1].date);
      const currDate = new Date(contracts[i].date);
      const daysDiff = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysDiff <= 90) {
        current.push(contracts[i]);
      } else {
        clusters.push(current);
        current = [contracts[i]];
      }
    }
    clusters.push(current);

    // Flag clusters: 3+ contracts, OR 2 contracts totaling >$25K within 60 days
    for (const cluster of clusters) {
      const combinedValue = cluster.reduce((sum, c) => sum + c.amount, 0);
      const firstDate = new Date(cluster[0].date);
      const lastDate = new Date(cluster[cluster.length - 1].date);
      const daySpan = Math.round((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));

      const flagged =
        cluster.length >= 3 ||
        (cluster.length >= 2 && combinedValue > 25000 && daySpan <= 60);

      if (flagged) {
        const firstMonth = cluster[0].date.substring(0, 7);
        const lastMonth = cluster[cluster.length - 1].date.substring(0, 7);
        candidates.push({
          supplier,
          contractCount: cluster.length,
          combinedValue,
          avgValue: combinedValue / cluster.length,
          dateRange: firstMonth === lastMonth ? firstMonth : `${firstMonth} → ${lastMonth}`,
          daySpan,
        });
      }
    }
  }

  // Sort by combined value descending, limit to top 10
  candidates.sort((a, b) => b.combinedValue - a.combinedValue);
  return candidates.slice(0, 10);
}

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

  // --- Split detection: suppliers with clusters of contracts just below $25K ---
  const splitCandidates = detectContractSplitting(from, to);

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
    splitCandidates,
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

// --- Round-number clustering ---

/** Threshold config: suspicious round numbers just below each procurement threshold */
const ROUND_NUMBER_THRESHOLDS: {
  threshold: number;
  label: string;
  roundAmounts: number[];
  comparisonMin: number;  // band just above threshold
  comparisonMax: number;
  /** Only apply to contracts in this date range (era-aware) */
  from?: string;
  to?: string;
}[] = [
  {
    threshold: 25000,
    label: "$25K",
    roundAmounts: [24999, 24990, 24900, 24800, 24500, 24000, 23000, 20000],
    comparisonMin: 25000,
    comparisonMax: 26000,
  },
  {
    threshold: 100000,
    label: "$100K",
    roundAmounts: [99999, 99900, 99500, 99000, 98000, 95000],
    comparisonMin: 100000,
    comparisonMax: 101000,
    from: "2017-07-01",
    to: "2019-08-01",
  },
  {
    threshold: 101100,
    label: "$101.1K",
    roundAmounts: [101099, 101000, 100999, 100900, 100500, 100000],
    comparisonMin: 101100,
    comparisonMax: 102100,
    from: "2019-08-01",
    to: "2022-01-01",
  },
  {
    threshold: 105700,
    label: "$105.7K",
    roundAmounts: [105699, 105600, 105500, 105000, 104999, 104000],
    comparisonMin: 105700,
    comparisonMax: 106700,
    from: "2022-01-01",
    to: "2022-10-07",
  },
  {
    threshold: 121200,
    label: "$121.2K",
    roundAmounts: [121199, 121100, 121000, 120999, 120900, 120500, 120000],
    comparisonMin: 121200,
    comparisonMax: 122200,
    from: "2022-10-07",
    to: "2024-01-01",
  },
  {
    threshold: 133800,
    label: "$133.8K",
    roundAmounts: [133799, 133700, 133500, 133000, 132999, 132000, 130000],
    comparisonMin: 133800,
    comparisonMax: 134800,
    from: "2024-01-01",
    to: "2026-01-01",
  },
];

export interface RoundNumberGroup {
  threshold: number;
  label: string;
  clusters: { amount: number; count: number }[];
  comparisonBandCount: number;
  totalBelow: number;  // total contracts at these round amounts
}

export const getRoundNumberAnalysis = cache(async (from: string, to: string): Promise<RoundNumberGroup[]> => {
  const results: RoundNumberGroup[] = [];

  for (const cfg of ROUND_NUMBER_THRESHOLDS) {
    // Apply era filtering: skip if selected range doesn't overlap this threshold's era
    const eraFrom = cfg.from && cfg.from > from ? cfg.from : from;
    const eraTo = cfg.to && cfg.to < to ? cfg.to : to;
    if (eraFrom >= eraTo) continue;

    const clusters = queryRoundNumberContracts(eraFrom, eraTo, cfg.roundAmounts);
    if (clusters.length === 0) continue;

    const comparisonBandCount = queryComparisonBandCount(eraFrom, eraTo, cfg.comparisonMin, cfg.comparisonMax);
    const totalBelow = clusters.reduce((sum, c) => sum + c.count, 0);

    results.push({
      threshold: cfg.threshold,
      label: cfg.label,
      clusters,
      comparisonBandCount,
      totalBelow,
    });
  }

  return results;
});

// --- Monthly distribution (year-end spending surge) ---

export const getMonthlyDistribution = cache(async (from: string, to: string): Promise<MonthlySpending[]> => {
  const raw = queryMonthlyDistributionDb(from, to);
  if (raw.length === 0) return [];

  const maxCount = Math.max(...raw.map((r) => r.count));

  return raw.map((r) => ({
    month: r.month,
    count: r.count,
    totalValue: r.totalValue,
    isOutlier: r.count === maxCount,
  }));
});

// --- Department-supplier loyalty ---

export const getDeptSupplierLoyalty = cache(async (from: string, to: string): Promise<DeptSupplierPair[]> => {
  const rawPairs = queryDeptSupplierPairs(from, to);
  const deptTotals = queryDeptTotals(from, to);
  const deptTotalMap = new Map(deptTotals.map((d) => [d.service, d.totalValue]));

  // Normalize supplier names and re-aggregate
  const aggregated = new Map<string, { department: string; supplier: string; count: number; totalValue: number }>();
  for (const p of rawPairs) {
    const normalizedSupplier = normalizeSupplierName(p.supplier);
    const key = `${p.service}|||${normalizedSupplier}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.count += p.count;
      existing.totalValue += p.totalValue;
    } else {
      aggregated.set(key, {
        department: p.service,
        supplier: normalizedSupplier,
        count: p.count,
        totalValue: p.totalValue,
      });
    }
  }

  const results: DeptSupplierPair[] = [];
  for (const entry of aggregated.values()) {
    const deptTotal = deptTotalMap.get(entry.department) || 0;
    const pctOfDeptSpend = deptTotal > 0 ? (entry.totalValue / deptTotal) * 100 : 0;
    results.push({
      department: entry.department,
      supplier: entry.supplier,
      contractCount: entry.count,
      totalValue: entry.totalValue,
      pctOfDeptSpend,
      isHighConcentration: pctOfDeptSpend > 50,
    });
  }

  return results
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 15);
});

// --- Supplier growth trajectories ---

export const getSupplierGrowth = cache(async (from: string, to: string): Promise<SupplierGrowthResult> => {
  // Compute midpoint
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const midMs = fromDate.getTime() + (toDate.getTime() - fromDate.getTime()) / 2;
  const midDate = new Date(midMs);
  const midpoint = `${midDate.getFullYear()}-${String(midDate.getMonth() + 1).padStart(2, "0")}-${String(midDate.getDate()).padStart(2, "0")}`;

  // Format period labels (YYYY-MM)
  const earlyLabel = `${from.substring(0, 7)} – ${midpoint.substring(0, 7)}`;
  const lateLabel = `${midpoint.substring(0, 7)} – ${to.substring(0, 7)}`;

  const raw = querySupplierHalfPeriodTotals(from, to, midpoint);

  // Normalize and aggregate by supplier + half
  const bySupplier = new Map<string, { early: number; late: number }>();
  for (const r of raw) {
    const name = normalizeSupplierName(r.supplier);
    const existing = bySupplier.get(name) || { early: 0, late: 0 };
    if (r.half === 1) existing.early += r.totalValue;
    else existing.late += r.totalValue;
    bySupplier.set(name, existing);
  }

  const results: SupplierGrowth[] = [];
  for (const [supplier, data] of bySupplier) {
    if (data.early < 100000 || data.late < 100000) continue;
    const growthPct = ((data.late - data.early) / data.early) * 100;
    results.push({
      supplier,
      earlyValue: data.early,
      lateValue: data.late,
      growthPct,
    });
  }

  return {
    suppliers: results.sort((a, b) => b.growthPct - a.growthPct).slice(0, 10),
    earlyLabel,
    lateLabel,
  };
});

// --- Contract search ---

/** Parse a numeric amount string (e.g. "50,000" or "1.5") with optional k/m suffix. */
function parseAmountNum(numStr: string, suffix?: string): number | null {
  const cleaned = numStr.replace(/[,\s]/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  const s = (suffix || "").toLowerCase();
  if (s === "k") return num * 1_000;
  if (s === "m") return num * 1_000_000;
  return num;
}

/**
 * Detect if a search query is an amount pattern and return min/max filter.
 * Supports: 50000, $50k, 1.5m, >25000, <=100k, 50k-100k, $50,000
 */
function parseAmountQuery(query: string): { min?: number; max?: number } | null {
  const q = query.trim();

  // Range: 50k-100k, $50,000-$100,000
  const rangeMatch = q.match(/^\$?([\d,.]+)\s*(k|m)?\s*[-–]\s*\$?([\d,.]+)\s*(k|m)?$/i);
  if (rangeMatch) {
    const min = parseAmountNum(rangeMatch[1], rangeMatch[2]);
    const max = parseAmountNum(rangeMatch[3], rangeMatch[4]);
    if (min !== null && max !== null) return { min, max };
  }

  // Comparison: >50k, >=50000, <100k, <=1m
  const compMatch = q.match(/^([<>]=?)\s*\$?([\d,.]+)\s*(k|m)?$/i);
  if (compMatch) {
    const val = parseAmountNum(compMatch[2], compMatch[3]);
    if (val !== null) {
      switch (compMatch[1]) {
        case ">": return { min: val + 0.01 };
        case ">=": return { min: val };
        case "<": return { max: val - 0.01 };
        case "<=": return { max: val };
      }
    }
  }

  // Single amount: $50k, 50000, 50,000
  const singleMatch = q.match(/^\$?([\d,.]+)\s*(k|m)?$/i);
  if (singleMatch) {
    const val = parseAmountNum(singleMatch[1], singleMatch[2]);
    if (val !== null) {
      // ±5% range for single value matches
      return { min: val * 0.95, max: val * 1.05 };
    }
  }

  return null;
}

// --- Cross-request LRU cache for search (module-level, persists across requests) ---
const SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const SEARCH_CACHE_MAX = 200;
const searchLru = new Map<string, { result: ContractSearchResult; expires: number }>();

function lruGet(key: string): ContractSearchResult | null {
  const entry = searchLru.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { searchLru.delete(key); return null; }
  // Move to end (most recently used)
  searchLru.delete(key);
  searchLru.set(key, entry);
  return entry.result;
}

function lruSet(key: string, result: ContractSearchResult): void {
  if (searchLru.size >= SEARCH_CACHE_MAX) {
    // Evict oldest (first entry in Map iteration order)
    const oldest = searchLru.keys().next().value;
    if (oldest) searchLru.delete(oldest);
  }
  searchLru.set(key, { result, expires: Date.now() + SEARCH_CACHE_TTL });
}

export const searchContractsCached = cache(async (
  from: string, to: string, query: string, page: number, sort?: string
): Promise<ContractSearchResult> => {
  const cacheKey = `${from}|${to}|${query}|${page}|${sort || ""}`;
  const cached = lruGet(cacheKey);
  if (cached) return cached;

  const perPage = 25;
  const offset = (page - 1) * perPage;

  const amountFilter = parseAmountQuery(query);
  const textQuery = amountFilter ? "" : query;

  const { results: rawResults, totalCount } = searchContracts(from, to, textQuery, perPage, offset, amountFilter ?? undefined, sort);

  const results = rawResults.map((r) => ({
    ...r,
    supplier: r.supplier ? normalizeSupplierName(r.supplier) : r.supplier,
  }));

  const result: ContractSearchResult = {
    results,
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / perPage),
    query,
  };

  lruSet(cacheKey, result);
  return result;
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
    needsHelp: r.needs_help === 1,
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

export const getNeedsHelpPromises = cache(async (): Promise<CampaignPromise[]> => {
  const raw = queryNeedsHelpPromises();
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

export function getNeedsHelpCount(): number {
  return queryNeedsHelpCount();
}

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
