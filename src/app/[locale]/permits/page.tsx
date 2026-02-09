import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getBoroughComparisonData, getCitySummary, getYearlyPermitTrends } from "@/lib/data";
import type { YearlyPermitTrend } from "@/lib/data";
import { PERMIT_TARGET_DAYS, PREVIOUS_TARGET_DAYS } from "@/lib/scoring";
import { PermitBarChart } from "@/components/PermitBarChart";
import { PermitTrendSection } from "@/components/PermitTrendSection";
import { StatCard } from "@/components/StatCard";
import { YearSelector } from "@/components/YearSelector";

export const revalidate = 3600;

const MIN_YEAR = 2015;

/** Administration presets — last full calendar year of each term */
const ADMIN_PRESETS = [
  { label: "Coderre (2017)", year: 2017 },
  { label: "Plante (2025)", year: 2025 },
  { label: "Martinez Ferrada (2026)", year: 2026 },
];

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "PermitsPage" });
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    alternates: {
      canonical: `https://montrealscore.ashwater.ca/${locale}/permits`,
      languages: { fr: "/fr/permits", en: "/en/permits" },
    },
  };
}

export default async function PermitsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { year: yearParam } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("PermitsPage");
  const tChart = await getTranslations("PermitBarChart");

  const currentYear = new Date().getFullYear();
  const maxYear = currentYear;

  // Parse and clamp year from search params; default to last full year
  let selectedYear = yearParam ? parseInt(yearParam, 10) : currentYear - 1;
  if (isNaN(selectedYear) || selectedYear < MIN_YEAR) selectedYear = MIN_YEAR;
  if (selectedYear > maxYear) selectedYear = maxYear;

  // Compute all trend variants in parallel
  const [comparison, summary, trendsAll, trendsHousing, trendsTR, trendsCO, trendsDE, trendsCA] =
    await Promise.all([
      getBoroughComparisonData(selectedYear),
      getCitySummary(selectedYear),
      getYearlyPermitTrends(MIN_YEAR),
      getYearlyPermitTrends(MIN_YEAR, { housingOnly: true }),
      getYearlyPermitTrends(MIN_YEAR, { permitType: "TR" }),
      getYearlyPermitTrends(MIN_YEAR, { permitType: "CO" }),
      getYearlyPermitTrends(MIN_YEAR, { permitType: "DE" }),
      getYearlyPermitTrends(MIN_YEAR, { permitType: "CA" }),
    ]);

  const trendsByFilter: Record<string, YearlyPermitTrend[]> = {
    all: trendsAll,
    housing: trendsHousing,
    TR: trendsTR,
    CO: trendsCO,
    DE: trendsDE,
    CA: trendsCA,
  };

  const localeTag = locale === "fr" ? "fr-CA" : "en-CA";

  const chartData = comparison.map((c) => ({
    borough: c.borough,
    medianDays: c.value,
    grade: c.grade,
  }));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <YearSelector
          selectedYear={selectedYear}
          minYear={MIN_YEAR}
          maxYear={maxYear}
          label={t("year")}
          presets={ADMIN_PRESETS}
        />
      </div>
      <p className="text-muted mb-8">
        {t("subtitle", { target: PERMIT_TARGET_DAYS, previousTarget: PREVIOUS_TARGET_DAYS })}
      </p>

      {/* Stats row — housing permits (primary metric) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <StatCard
          label={t("housingPermits")}
          value={summary.housing_permits_ytd.toLocaleString(localeTag)}
          detail={t("allPermitsCount", { count: summary.total_permits_ytd.toLocaleString(localeTag) })}
        />
        <StatCard
          label={t("housingMedian")}
          value={Math.round(summary.housing_median_days)}
          unit={t("days")}
          detail={t("allPermitsMedian", { days: Math.round(summary.median_processing_days) })}
        />
        <StatCard
          label={t("withinTarget", { target: PERMIT_TARGET_DAYS })}
          value={Math.round(summary.housing_pct_within_target)}
          unit={t("percent")}
        />
        <StatCard
          label={t("trend")}
          value={
            summary.trend_vs_last_year < 0
              ? Math.abs(Math.round(summary.trend_vs_last_year))
              : `+${Math.round(summary.trend_vs_last_year)}`
          }
          unit={t("days")}
          detail={t("vsLastYear")}
          trend={summary.trend_vs_last_year < -5 ? "down" : summary.trend_vs_last_year > 5 ? "up" : "flat"}
          trendLabel={summary.trend_vs_last_year < 0 ? t("improvement") : t("deterioration")}
        />
      </div>
      <p className="text-xs text-muted mb-8">{t("housingNote")}</p>

      {/* Borough comparison chart */}
      {chartData.length > 0 ? (
        <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-8">
          <h2 className="text-xl font-bold mb-4">
            {t("housingMedianByBorough")}
          </h2>
          <PermitBarChart
            data={chartData}
            targetDays={PERMIT_TARGET_DAYS}
            previousTargetDays={PREVIOUS_TARGET_DAYS}
            labels={{
              yAxis: tChart("yAxisLabel"),
              tooltipLabel: tChart("tooltipLabel"),
              tooltipUnit: t("days"),
              targetLabel: tChart("targetLabel", { target: PERMIT_TARGET_DAYS }),
              previousTargetLabel: tChart("previousTargetLabel", { target: PREVIOUS_TARGET_DAYS }),
            }}
          />
          <p className="text-xs text-muted mt-4 text-center">
            {t("chartFootnote", { target: PERMIT_TARGET_DAYS })}
          </p>
        </section>
      ) : (
        <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-8 text-center text-muted">
          <p>{t("noHousingData")}</p>
        </section>
      )}

      {/* Historical trends + YoY chart (shared filter) */}
      <div className="mb-8">
        <PermitTrendSection
          trends={trendsByFilter}
          locale={locale}
          labels={{
            filterLabel: t("filterLabel"),
            filterAll: t("filterAll"),
            filterHousing: t("filterHousing"),
            filterTR: t("filterTR"),
            filterCO: t("filterCO"),
            filterDE: t("filterDE"),
            filterCA: t("filterCA"),
            year: t("year"),
            permitsFiled: t("permitsFiled"),
            medianDays: t("medianDays"),
            historicalTrend: t("historicalTrend"),
            days: t("days"),
            yoyTitle: t("yoyTitle"),
            yoyYAxis: t("yoyYAxis"),
          }}
        />
      </div>

      {/* Methodology */}
      <section className="mt-8 text-sm text-muted">
        <h3 className="font-semibold text-foreground mb-2">{t("methodology")}</h3>
        <p>
          {t("methodologyText")}
        </p>
      </section>
    </div>
  );
}
