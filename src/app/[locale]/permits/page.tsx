import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getBoroughComparisonData, getCitySummary, getYearlyTrendData } from "@/lib/data";
import { PERMIT_TARGET_DAYS, PREVIOUS_TARGET_DAYS } from "@/lib/scoring";
import { PermitBarChart } from "@/components/PermitBarChart";
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

  const [comparison, summary, trends] = await Promise.all([
    getBoroughComparisonData(selectedYear),
    getCitySummary(selectedYear),
    getYearlyTrendData(),
  ]);

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
            labels={{
              yAxis: tChart("yAxisLabel"),
              tooltipLabel: tChart("tooltipLabel"),
              tooltipUnit: t("days"),
              targetLabel: tChart("targetLabel", { target: PERMIT_TARGET_DAYS }),
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

      {/* Historical trends */}
      <section className="border border-card-border rounded-xl p-6 bg-card-bg">
        <h2 className="text-xl font-bold mb-4">{t("historicalTrend")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-left">
                <th className="py-2 pr-4">{t("year")}</th>
                <th className="py-2">{t("permitsFiled")}</th>
              </tr>
            </thead>
            <tbody>
              {trends.map(
                (tr: { year: number; totalPermits: number }) => (
                  <tr key={tr.year} className="border-b border-card-border">
                    <td className="py-2 pr-4 font-mono">{tr.year}</td>
                    <td className="py-2">
                      {tr.totalPermits.toLocaleString(localeTag)}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

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
