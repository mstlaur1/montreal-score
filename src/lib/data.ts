import { cache } from "react";
import { fetchPermitsByYear, fetchYearlyTrends } from "./montreal-api";
import { normalizeBoroughName, getBoroughSlug } from "./boroughs";
import { calculateBoroughScores, rankBoroughs, scoreToGrade, PERMIT_TARGET_DAYS } from "./scoring";
import type { BoroughPermitStats, BoroughScore, BoroughComparison, CitySummary } from "./types";

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
