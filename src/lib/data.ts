import { cache } from "react";
import { fetchPermitsByYear, fetchYearlyTrends, fetchContractsByYear } from "./montreal-api";
import { normalizeBoroughName, getBoroughSlug } from "./boroughs";
import { calculateBoroughScores, rankBoroughs, scoreToGrade, PERMIT_TARGET_DAYS } from "./scoring";
import type { BoroughPermitStats, BoroughScore, BoroughComparison, CitySummary, RawContract, ContractStats } from "./types";

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
 * Wrapped with React cache() to deduplicate across components in the same request.
 */
export const getBoroughPermitStats = cache(async (year: number): Promise<BoroughPermitStats[]> => {
  const [currentPermits, prevPermits] = await Promise.all([
    fetchPermitsByYear(year),
    fetchPermitsByYear(year - 1),
  ]);

  function computeStats(permits: typeof currentPermits) {
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

  const current = computeStats(currentPermits);
  const prev = computeStats(prevPermits);

  const stats: BoroughPermitStats[] = [];

  for (const [borough, data] of current) {
    const sorted = data.days.sort((a, b) => a - b);
    const med = median(sorted);
    const prevData = prev.get(borough);
    const prevMedian = prevData ? median(prevData.days.sort((a, b) => a - b)) : med;

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
 */
export async function getBoroughComparisonData(year: number): Promise<BoroughComparison[]> {
  const stats = await getBoroughPermitStats(year);
  const scores = calculateBoroughScores(stats);

  return stats
    .map((s) => {
      const score = scores.find((sc) => sc.slug === s.slug);
      return {
        borough: s.borough,
        slug: s.slug,
        value: s.median_processing_days,
        target: PERMIT_TARGET_DAYS,
        grade: score?.permits_grade || scoreToGrade(0),
      };
    })
    .sort((a, b) => a.value - b.value);
}

/**
 * Get city-wide summary statistics.
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
      last_updated: new Date().toISOString(),
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

  const best = stats.reduce((a, b) =>
    a.median_processing_days < b.median_processing_days && a.median_processing_days > 0 ? a : b
  );
  const worst = stats.reduce((a, b) =>
    a.median_processing_days > b.median_processing_days ? a : b
  );

  const avgTrend =
    stats.reduce((sum, s) => sum + s.trend_vs_last_year, 0) / stats.length;

  return {
    total_permits_ytd: totalPermits,
    median_processing_days: cityMedian,
    pct_within_target: pctWithinTarget,
    target_days: PERMIT_TARGET_DAYS,
    best_borough: best.borough,
    worst_borough: worst.borough,
    trend_vs_last_year: avgTrend,
    last_updated: new Date().toISOString(),
  };
}

/**
 * Get yearly trend data using per-year aggregation queries.
 */
export async function getYearlyTrendData() {
  return fetchYearlyTrends(2015);
}

// --- Contracts ---

/**
 * Get contract stats aggregated from live CKAN data.
 */
export const getContractStats = cache(async (year: number): Promise<ContractStats> => {
  const raw = await fetchContractsByYear(year);

  const amounts = raw
    .map((c) => parseFloat(c.MONTANT))
    .filter((n) => !isNaN(n));
  const sortedAmounts = [...amounts].sort((a, b) => a - b);
  const totalValue = amounts.reduce((sum, v) => sum + v, 0);

  // Top suppliers by total value
  const supplierMap = new Map<string, { count: number; totalValue: number }>();
  for (const c of raw) {
    const name = c["NOM DU FOURNISSEUR"];
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
  // < $25K: no formal process required
  // $25K–threshold: invitation tender or direct agreement
  // >= threshold: mandatory public call for tenders
  // Threshold changed Jan 1, 2026: $133,800 -> $139,000
  const TENDER_THRESHOLD_OLD = 133800; // 2024-2025
  const TENDER_THRESHOLD_NEW = 139000; // 2026-2027
  const THRESHOLD_CUTOVER = "2026-01-01";

  // Split contracts into eras by approval date
  const preContracts = raw.filter((c) => c["DATE D'APPROBATION"] < THRESHOLD_CUTOVER);
  const postContracts = raw.filter((c) => c["DATE D'APPROBATION"] >= THRESHOLD_CUTOVER);
  const preAmounts = preContracts.map((c) => parseFloat(c.MONTANT)).filter((n) => !isNaN(n));
  const postAmounts = postContracts.map((c) => parseFloat(c.MONTANT)).filter((n) => !isNaN(n));

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

  const thresholdClusters = [
    // $25K — applies to all contracts regardless of era
    {
      threshold: 25000,
      label: "$25K",
      period: "",
      ...clusterAroundThreshold(amounts, 25000, 5000),
    },
    // Old tender threshold — only pre-2026 contracts
    ...(preAmounts.length > 0
      ? [{
          threshold: TENDER_THRESHOLD_OLD,
          label: "$133.8K",
          period: "2024–2025",
          ...clusterAroundThreshold(preAmounts, TENDER_THRESHOLD_OLD, 13800),
        }]
      : []),
    // New tender threshold — only 2026+ contracts
    ...(postAmounts.length > 0
      ? [{
          threshold: TENDER_THRESHOLD_NEW,
          label: "$139K",
          period: "2026–2027",
          ...clusterAroundThreshold(postAmounts, TENDER_THRESHOLD_NEW, 14000),
        }]
      : []),
  ];

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
    year,
  };
});
