import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getBoroughComparisonData, getCitySummary, getYearlyTrendData } from "@/lib/data";
import { PERMIT_TARGET_DAYS, PREVIOUS_TARGET_DAYS } from "@/lib/scoring";
import { PermitBarChart } from "@/components/PermitBarChart";
import { StatCard } from "@/components/StatCard";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "PermitsPage" });
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default async function PermitsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("PermitsPage");
  const tChart = await getTranslations("PermitBarChart");

  const currentYear = new Date().getFullYear();
  let comparison, summary, trends;

  try {
    [comparison, summary, trends] = await Promise.all([
      getBoroughComparisonData(currentYear),
      getCitySummary(currentYear),
      getYearlyTrendData(),
    ]);
  } catch {
    const fallbackYear = currentYear - 1;
    [comparison, summary, trends] = await Promise.all([
      getBoroughComparisonData(fallbackYear),
      getCitySummary(fallbackYear),
      getYearlyTrendData(),
    ]);
  }

  const localeTag = locale === "fr" ? "fr-CA" : "en-CA";

  const chartData = comparison.map((c) => ({
    borough: c.borough,
    medianDays: c.value,
    grade: c.grade,
  }));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
      <p className="text-muted mb-8">
        {t("subtitle", { target: PERMIT_TARGET_DAYS, previousTarget: PREVIOUS_TARGET_DAYS })}
      </p>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label={t("permitsThisYear")}
          value={summary.total_permits_ytd.toLocaleString(localeTag)}
        />
        <StatCard
          label={t("medianDelay")}
          value={Math.round(summary.median_processing_days)}
          unit={t("days")}
        />
        <StatCard
          label={t("withinTarget", { target: PERMIT_TARGET_DAYS })}
          value={Math.round(summary.pct_within_target)}
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

      {/* Borough comparison chart */}
      <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-8">
        <h2 className="text-xl font-bold mb-4">
          {t("medianByBorough")}
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
