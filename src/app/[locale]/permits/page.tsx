import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getBoroughComparisonDataRange, getCitySummaryRange, getAllYearlyPermitTrends } from "@/lib/data";
import { getPermitDateBounds } from "@/lib/db";
import { PERMIT_TARGET_DAYS, PREVIOUS_TARGET_DAYS } from "@/lib/scoring";
import { PermitBarChart } from "@/components/PermitBarChart";
import { PermitTrendSection } from "@/components/PermitTrendSection";
import { StatCard } from "@/components/StatCard";
import { DateRangeSelector } from "@/components/DateRangeSelector";

export const revalidate = 3600;

const MIN_YEAR = 2015;

function parseYearMonth(param: string | undefined): { year: number; month: number } | null {
  if (!param) return null;
  const match = param.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function toDateStr(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "PermitsPage" });
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    openGraph: {
      url: `https://montrealscore.ashwater.ca/${locale}/permits`,
    },
    alternates: {
      canonical: `https://montrealscore.ashwater.ca/${locale}/permits`,
      languages: {
        fr: "https://montrealscore.ashwater.ca/fr/permits",
        en: "https://montrealscore.ashwater.ca/en/permits",
        "x-default": "https://montrealscore.ashwater.ca/fr/permits",
      },
    },
  };
}

export default async function PermitsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { from: fromParam, to: toParam } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("PermitsPage");
  const tChart = await getTranslations("PermitBarChart");

  const bounds = getPermitDateBounds();
  const [boundsMinY, boundsMinM] = bounds.min.split("-").map(Number);
  const [boundsMaxY, boundsMaxM] = bounds.max.split("-").map(Number);

  // Default: previous full calendar year (Jan–Dec)
  const currentYear = new Date().getFullYear();
  const defaultFrom = { year: currentYear - 1, month: 1 };
  const defaultTo = { year: currentYear - 1, month: 12 };

  let from = parseYearMonth(fromParam) ?? defaultFrom;
  let to = parseYearMonth(toParam) ?? defaultTo;

  // Clamp to bounds
  if (from.year < boundsMinY || (from.year === boundsMinY && from.month < boundsMinM)) {
    from = { year: boundsMinY, month: boundsMinM };
  }
  if (to.year > boundsMaxY || (to.year === boundsMaxY && to.month > boundsMaxM)) {
    to = { year: boundsMaxY, month: boundsMaxM };
  }
  // Ensure from <= to
  if (from.year > to.year || (from.year === to.year && from.month > to.month)) {
    to = { ...from };
  }

  const fromDate = toDateStr(from.year, from.month);
  const toExcl = nextMonth(to.year, to.month);
  const toDate = toDateStr(toExcl.year, toExcl.month);

  // Administration presets (month-precise inauguration dates)
  const presets = [
    { label: "Coderre (2014–2017)", from: "2014-01", to: "2017-10" },
    { label: "Plante (2017–2025)", from: "2017-11", to: "2025-10" },
    { label: "Martinez Ferrada (2025–)", from: "2025-11", to: bounds.max },
  ];

  // Fetch borough data + all trend variants (single DB query + single pass)
  const [comparison, summary, trendsByFilter] =
    await Promise.all([
      getBoroughComparisonDataRange(fromDate, toDate),
      getCitySummaryRange(fromDate, toDate),
      Promise.resolve(getAllYearlyPermitTrends(MIN_YEAR)),
    ]);

  const localeTag = locale === "fr" ? "fr-CA" : "en-CA";

  const chartData = comparison.map((c) => ({
    borough: c.borough,
    medianDays: c.value,
    grade: c.grade,
  }));

  // Determine if trend card is meaningful (single-year range)
  const rangeMs = new Date(toDate).getTime() - new Date(fromDate).getTime();
  const isSingleYear = rangeMs <= 366 * 24 * 60 * 60 * 1000;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <DateRangeSelector
          fromYear={from.year}
          fromMonth={from.month}
          toYear={to.year}
          toMonth={to.month}
          minDate={bounds.min}
          maxDate={bounds.max}
          locale={locale}
          labels={{ from: t("from"), to: t("to") }}
          presets={presets}
        />
      </div>
      <p className="text-muted mb-8">
        {t("subtitle", { target: PERMIT_TARGET_DAYS, previousTarget: PREVIOUS_TARGET_DAYS })}
      </p>

      {/* Stats row — housing permits (primary metric) */}
      <div className={`grid grid-cols-2 ${isSingleYear ? "md:grid-cols-4" : "md:grid-cols-3"} gap-4 mb-4`}>
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
        {isSingleYear && (
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
        )}
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
        <h2 className="font-semibold text-foreground mb-2">{t("methodology")}</h2>
        <p>
          {t("methodologyText")}
        </p>
      </section>
    </div>
  );
}
