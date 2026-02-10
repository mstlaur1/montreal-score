import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  getSRSummary, getSRBoroughStats, getSRCategories,
  getSRChannels, getSRStatuses, getSRMonthlyVolume,
  getSRPotholeStats, getSRPotholeAllYears,
} from "@/lib/data";
import { querySRYearRange } from "@/lib/db";
import { StatCard } from "@/components/StatCard";
import { YearSelector } from "@/components/YearSelector";

export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ServiceRequestsPage" });
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    openGraph: {
      url: `https://montrealscore.ashwater.ca/${locale}/311`,
    },
    alternates: {
      canonical: `https://montrealscore.ashwater.ca/${locale}/311`,
      languages: {
        fr: "https://montrealscore.ashwater.ca/fr/311",
        en: "https://montrealscore.ashwater.ca/en/311",
        "x-default": "https://montrealscore.ashwater.ca/fr/311",
      },
    },
  };
}

export default async function ServiceRequestsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { year: yearParam } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("ServiceRequestsPage");

  const yearRange = querySRYearRange();
  if (!yearRange) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-4">{t("title")}</h1>
        <p className="text-muted">{t("noData")}</p>
      </div>
    );
  }

  const minYear = yearRange.min;
  const maxYear = yearRange.max;
  let selectedYear = yearParam ? parseInt(yearParam, 10) : maxYear;
  if (isNaN(selectedYear) || selectedYear < minYear) selectedYear = minYear;
  if (selectedYear > maxYear) selectedYear = maxYear;

  const [summary, boroughStats, categories, channels, statuses, monthlyVolume, potholeStats, potholeAllYears] =
    await Promise.all([
      getSRSummary(selectedYear),
      getSRBoroughStats(selectedYear),
      getSRCategories(selectedYear),
      getSRChannels(selectedYear),
      getSRStatuses(selectedYear),
      getSRMonthlyVolume(),
      getSRPotholeStats(selectedYear),
      getSRPotholeAllYears(),
    ]);

  const localeTag = locale === "fr" ? "fr-CA" : "en-CA";
  const fmt = (n: number) => n.toLocaleString(localeTag);
  const fmtPct = (n: number) => `${Math.round(n)}%`;

  // Monthly totals for the selected year (aggregate all natures)
  const yearPrefix = String(selectedYear);
  const monthlyForYear = new Map<string, number>();
  for (const m of monthlyVolume) {
    if (m.yearMonth.startsWith(yearPrefix)) {
      monthlyForYear.set(m.yearMonth, (monthlyForYear.get(m.yearMonth) ?? 0) + m.count);
    }
  }
  const monthlyEntries = [...monthlyForYear.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  // Month name helper
  const monthName = (ym: string) => {
    const [y, m] = ym.split("-");
    const date = new Date(parseInt(y), parseInt(m) - 1, 1);
    return date.toLocaleString(localeTag, { month: "short" });
  };

  // Translation helper for statuses and channels
  const translateStatus = (s: string) => {
    try { return t(`statusTranslation.${s}`); } catch { return s; }
  };
  const translateChannel = (c: string) => {
    try { return t(`channelTranslation.${c}`); } catch { return c; }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <YearSelector
          selectedYear={selectedYear}
          minYear={minYear}
          maxYear={maxYear}
          label={t("year")}
        />
      </div>
      <p className="text-muted mb-8">{t("subtitle")}</p>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label={t("totalRequests")}
            value={fmt(summary.totalRequests)}
          />
          <StatCard
            label={t("resolutionRate")}
            value={fmtPct(summary.resolutionRate)}
            detail={`${fmt(summary.totalCompleted)} ${t("completed").toLowerCase()}`}
          />
          <StatCard
            label={t("avgResponseTime")}
            value={summary.avgResponseDays != null ? Math.round(summary.avgResponseDays) : t("na")}
            unit={summary.avgResponseDays != null ? t("days") : undefined}
          />
          <StatCard
            label={t("topCategory")}
            value={summary.topCategory}
          />
        </div>
      )}

      {/* Pothole spotlight */}
      {potholeStats && (
        <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-8">
          <h2 className="text-xl font-bold mb-1">{t("potholeTitle")}</h2>
          <p className="text-sm text-muted mb-4">{t("potholeSubtitle")}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <StatCard
              label={t("potholeTotal")}
              value={fmt(potholeStats.totalCount)}
            />
            <StatCard
              label={t("potholeResolution")}
              value={fmtPct(potholeStats.resolutionRate)}
            />
            <StatCard
              label={t("potholeResponseTime")}
              value={potholeStats.avgResponseDays != null ? Math.round(potholeStats.avgResponseDays) : t("na")}
              unit={potholeStats.avgResponseDays != null ? t("days") : undefined}
            />
          </div>
          {potholeAllYears.length > 1 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-card-border">
                    <th className="pb-2 pr-4">{t("potholeYear")}</th>
                    <th className="pb-2 pr-4 text-right">{t("potholeRequests")}</th>
                    <th className="pb-2 pr-4 text-right">{t("potholeResRate")}</th>
                    <th className="pb-2 text-right">{t("potholeAvgDays")}</th>
                  </tr>
                </thead>
                <tbody>
                  {potholeAllYears.map((p) => (
                    <tr key={p.year} className={`border-b border-card-border/50 ${p.year === selectedYear ? "font-medium" : ""}`}>
                      <td className="py-1.5 pr-4">{p.year}</td>
                      <td className="py-1.5 pr-4 text-right font-mono">{fmt(p.totalCount)}</td>
                      <td className="py-1.5 pr-4 text-right font-mono">{fmtPct(p.resolutionRate)}</td>
                      <td className="py-1.5 text-right font-mono">
                        {p.avgResponseDays != null ? Math.round(p.avgResponseDays) : t("na")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted mt-4 border-t border-card-border pt-3">
            {t("potholeCaveat")}
          </p>
        </section>
      )}

      {/* Borough comparison table */}
      {boroughStats.length > 0 && (
        <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-8">
          <h2 className="text-xl font-bold mb-1">{t("boroughTitle")}</h2>
          <p className="text-sm text-muted mb-4">{t("boroughSubtitle")}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-card-border">
                  <th className="pb-2 pr-4">{t("borough")}</th>
                  <th className="pb-2 pr-4 text-right">{t("requests")}</th>
                  <th className="pb-2 pr-4 text-right">{t("completed")}</th>
                  <th className="pb-2 pr-4 text-right">{t("resRate")}</th>
                  <th className="pb-2 text-right">{t("responseTime")}</th>
                </tr>
              </thead>
              <tbody>
                {boroughStats.map((b) => (
                  <tr key={b.borough} className="border-b border-card-border/50">
                    <td className="py-2 pr-4 font-medium">{b.borough}</td>
                    <td className="py-2 pr-4 text-right font-mono">{fmt(b.totalCount)}</td>
                    <td className="py-2 pr-4 text-right font-mono">{fmt(b.completedCount)}</td>
                    <td className={`py-2 pr-4 text-right font-mono ${b.resolutionRate >= 80 ? "text-grade-a" : b.resolutionRate >= 60 ? "text-grade-c" : "text-grade-f"}`}>
                      {fmtPct(b.resolutionRate)}
                    </td>
                    <td className="py-2 text-right font-mono">
                      {b.avgResponseDays != null ? Math.round(b.avgResponseDays) : t("na")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Monthly trend (simple bar representation) */}
      {monthlyEntries.length > 0 && (
        <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-8">
          <h2 className="text-xl font-bold mb-1">{t("trendTitle")}</h2>
          <p className="text-sm text-muted mb-4">{t("trendSubtitle")}</p>
          <div className="space-y-1">
            {(() => {
              const maxVal = Math.max(...monthlyEntries.map(([, c]) => c));
              return monthlyEntries.map(([ym, count]) => (
                <div key={ym} className="flex items-center gap-2">
                  <span className="w-12 text-xs text-muted font-mono">{monthName(ym)}</span>
                  <div className="flex-1 h-5 bg-card-border/30 rounded overflow-hidden">
                    <div
                      className="h-full bg-accent/70 rounded"
                      style={{ width: `${(count / maxVal) * 100}%` }}
                    />
                  </div>
                  <span className="w-16 text-xs font-mono text-right">{fmt(count)}</span>
                </div>
              ));
            })()}
          </div>
        </section>
      )}

      {/* Top categories and channels side by side */}
      <div className="grid md:grid-cols-2 gap-8 mb-8">
        {/* Categories */}
        {categories.length > 0 && (
          <section className="border border-card-border rounded-xl p-6 bg-card-bg">
            <h2 className="text-xl font-bold mb-1">{t("categoryTitle")}</h2>
            <p className="text-sm text-muted mb-4">{t("categorySubtitle")}</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-card-border">
                  <th className="pb-2 pr-4">{t("category")}</th>
                  <th className="pb-2 text-right">{t("count")}</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.category} className="border-b border-card-border/50">
                    <td className="py-1.5 pr-4 text-xs">{c.category}</td>
                    <td className="py-1.5 text-right font-mono text-xs">{fmt(c.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Channels + Statuses stacked */}
        <div className="space-y-8">
          {channels.length > 0 && (
            <section className="border border-card-border rounded-xl p-6 bg-card-bg">
              <h2 className="text-xl font-bold mb-1">{t("channelTitle")}</h2>
              <p className="text-sm text-muted mb-4">{t("channelSubtitle")}</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-card-border">
                    <th className="pb-2 pr-4">{t("channel")}</th>
                    <th className="pb-2 text-right">{t("count")}</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((c) => (
                    <tr key={c.channel} className="border-b border-card-border/50">
                      <td className="py-1.5 pr-4">{translateChannel(c.channel)}</td>
                      <td className="py-1.5 text-right font-mono">{fmt(c.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {statuses.length > 0 && (
            <section className="border border-card-border rounded-xl p-6 bg-card-bg">
              <h2 className="text-xl font-bold mb-1">{t("statusTitle")}</h2>
              <p className="text-sm text-muted mb-4">{t("statusSubtitle")}</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-card-border">
                    <th className="pb-2 pr-4">{t("status")}</th>
                    <th className="pb-2 text-right">{t("count")}</th>
                  </tr>
                </thead>
                <tbody>
                  {statuses.map((s) => (
                    <tr key={s.status} className="border-b border-card-border/50">
                      <td className="py-1.5 pr-4">{translateStatus(s.status)}</td>
                      <td className="py-1.5 text-right font-mono">{fmt(s.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      </div>

      {/* Methodology */}
      <section className="mt-8 text-sm text-muted">
        <h2 className="font-semibold text-foreground mb-2">{t("methodology")}</h2>
        <p>{t("methodologyText")}</p>
      </section>
    </div>
  );
}
