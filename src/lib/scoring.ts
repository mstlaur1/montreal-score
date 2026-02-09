import type { BoroughPermitStats, BoroughScore, Grade } from "./types";

/** Current permit processing target in days (Martinez Ferrada's promise) */
export const PERMIT_TARGET_DAYS = 90;

/** Previous administration's target */
export const PREVIOUS_TARGET_DAYS = 120;

/** Convert a 0-100 score to a letter grade */
export function scoreToGrade(score: number): Grade {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  if (score >= 20) return "D";
  return "F";
}

/** Get the CSS color variable for a grade */
export function gradeColor(grade: Grade): string {
  const colors: Record<Grade, string> = {
    A: "var(--grade-a)",
    B: "var(--grade-b)",
    C: "var(--grade-c)",
    D: "var(--grade-d)",
    F: "var(--grade-f)",
  };
  return colors[grade];
}

/** Get Tailwind color class for a grade */
export function gradeColorClass(grade: Grade): string {
  const classes: Record<Grade, string> = {
    A: "text-grade-a",
    B: "text-grade-b",
    C: "text-grade-c",
    D: "text-grade-d",
    F: "text-grade-f",
  };
  return classes[grade];
}

export function gradeBgClass(grade: Grade): string {
  const classes: Record<Grade, string> = {
    A: "bg-grade-a",
    B: "bg-grade-b",
    C: "bg-grade-c",
    D: "bg-grade-d",
    F: "bg-grade-f",
  };
  return classes[grade];
}

/**
 * Grade based on median processing days alone.
 * Used for chart bar coloring where the visual (bar height) = median days.
 * At/below target = A, degrades linearly up to 2x target = F.
 */
export function medianDaysToGrade(medianDays: number): Grade {
  const ratio = medianDays / PERMIT_TARGET_DAYS;
  const score = Math.max(0, Math.min(100, (1 - (ratio - 1)) * 100));
  return scoreToGrade(score);
}

/**
 * Score a borough's permit performance on a 0-100 scale.
 * Uses housing-only metrics (nb_logements > 0) — the permits subject to the 90-day target.
 * Falls back to all-permit metrics for boroughs with no housing permits.
 *
 * Factors:
 * - Median processing time vs target (40% weight)
 * - % of permits issued within target (40% weight)
 * - Year-over-year trend (20% weight)
 */
export function scorePermits(stats: BoroughPermitStats): number {
  const hasHousing = stats.housing_issued > 0;
  const medDays = hasHousing ? stats.housing_median_days : stats.median_processing_days;
  const pctWithin = hasHousing ? stats.housing_pct_within_90_days : stats.pct_within_90_days;
  const trend = hasHousing ? stats.housing_trend_vs_last_year : stats.trend_vs_last_year;

  // Median time score: 100 if at/below target, degrades linearly
  // At 2x target = 0 points
  const medianRatio = medDays / PERMIT_TARGET_DAYS;
  const medianScore = Math.max(0, Math.min(100, (1 - (medianRatio - 1)) * 100));

  // Percentage within target: direct mapping to 0-100
  const pctScore = pctWithin;

  // Trend score: improving = bonus, worsening = penalty
  // trend_vs_last_year is negative when improving
  // -30 days improvement = 100, +30 days worse = 0, 0 change = 50
  const trendScore = Math.max(0, Math.min(100, 50 - trend * (50 / 30)));

  return Math.round(medianScore * 0.4 + pctScore * 0.4 + trendScore * 0.2);
}

/**
 * Calculate borough scores from permit stats.
 * For now, overall = permit score (other categories added later).
 */
export function calculateBoroughScores(
  allStats: BoroughPermitStats[]
): BoroughScore[] {
  return allStats.map((stats) => {
    const permitsScore = scorePermits(stats);
    const permitsGrade = scoreToGrade(permitsScore);

    // Overall is just permits for now — will be weighted composite later
    const overallScore = permitsScore;
    const overallGrade = scoreToGrade(overallScore);

    return {
      borough: stats.borough,
      slug: stats.slug,
      overall_grade: overallGrade,
      overall_score: overallScore,
      permits_grade: permitsGrade,
      permits_score: permitsScore,
    };
  });
}

/**
 * Rank boroughs by score, best first.
 */
export function rankBoroughs(scores: BoroughScore[]): BoroughScore[] {
  return [...scores].sort((a, b) => b.overall_score - a.overall_score);
}
