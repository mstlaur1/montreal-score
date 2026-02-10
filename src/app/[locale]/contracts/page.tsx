import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  getContractStats, getSoleSourceStats, getYearlyContractTrends,
  getMonthlyDistribution, getDeptSupplierLoyalty, getSupplierGrowth,
  getRoundNumberAnalysis, searchContractsCached,
} from "@/lib/data";
import { getContractDateBounds } from "@/lib/db";
import { getNormalizationExamples } from "@/lib/supplier-normalization";
import { StatCard } from "@/components/StatCard";
import { ContractHistogram } from "@/components/ContractHistogram";
import { DateRangeSelector } from "@/components/DateRangeSelector";
import { ContractSearchInput } from "@/components/ContractSearchInput";

export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; to?: string; q?: string; page?: string; sort?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ContractsPage" });
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    alternates: {
      canonical: `https://montrealscore.ashwater.ca/${locale}/contracts`,
      languages: { fr: "/fr/contracts", en: "/en/contracts" },
    },
  };
}

function formatCurrency(value: number, locale: string, compact = false): string {
  const localeTag = locale === "fr" ? "fr-CA" : "en-CA";
  if (compact && Math.abs(value) >= 1_000_000) {
    return new Intl.NumberFormat(localeTag, {
      style: "currency",
      currency: "CAD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat(localeTag, {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

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

function getMonthName(month: number, locale: string): string {
  const fmt = new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", { month: "long" });
  return fmt.format(new Date(2024, month - 1, 1));
}

export default async function ContractsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { from: fromParam, to: toParam, q: searchQuery, page: pageParam, sort: sortParam } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("ContractsPage");

  const bounds = getContractDateBounds();
  const [boundsMinY, boundsMinM] = bounds.min.split("-").map(Number);
  const [boundsMaxY, boundsMaxM] = bounds.max.split("-").map(Number);

  // Default: last 12 months
  const now = new Date();
  const defaultTo = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const defaultFrom = {
    year: defaultTo.month <= 12 ? defaultTo.year - 1 : defaultTo.year,
    month: ((defaultTo.month - 1 + 12 - 12) % 12) + 1,
  };

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

  const searchPage = Math.min(1000, Math.max(1, parseInt(pageParam ?? "1", 10) || 1));

  const [stats, soleSource, yearlyTrends, monthlyDist, loyalty, growth, roundNumbers, searchResults] =
    await Promise.all([
      getContractStats(fromDate, toDate),
      getSoleSourceStats(fromDate, toDate),
      getYearlyContractTrends(),
      getMonthlyDistribution(fromDate, toDate),
      getDeptSupplierLoyalty(fromDate, toDate),
      getSupplierGrowth(fromDate, toDate),
      getRoundNumberAnalysis(fromDate, toDate),
      searchQuery ? searchContractsCached(fromDate, toDate, searchQuery, searchPage, sortParam) : Promise.resolve(null),
    ]);
  const normExamples = getNormalizationExamples();

  const localeTag = locale === "fr" ? "fr-CA" : "en-CA";
  const fmt = (v: number) => formatCurrency(v, locale);
  const fmtCompact = (v: number) => formatCurrency(v, locale, true);

  const presets = [
    { label: "Coderre (2013–2017)", from: "2013-11", to: "2017-11" },
    { label: "Plante (2017–2025)", from: "2017-11", to: "2025-11" },
    { label: "Martinez Ferrada (2025–)", from: "2025-11", to: bounds.max },
  ];

  // Build URL params for pagination/sort links
  function buildUrl(page: number, sort?: string): string {
    const params = new URLSearchParams();
    if (fromParam) params.set("from", fromParam);
    if (toParam) params.set("to", toParam);
    if (searchQuery) params.set("q", searchQuery);
    if (page > 1) params.set("page", String(page));
    const s = sort ?? sortParam;
    if (s) params.set("sort", s);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  function sortUrl(column: string): string {
    // Toggle: no sort → asc → desc → no sort
    const current = sortParam || "";
    let next: string | undefined;
    if (current === `${column}_asc`) next = `${column}_desc`;
    else if (current === `${column}_desc`) next = undefined;
    else next = `${column}_asc`;
    const params = new URLSearchParams();
    if (fromParam) params.set("from", fromParam);
    if (toParam) params.set("to", toParam);
    if (searchQuery) params.set("q", searchQuery);
    // Reset to page 1 when changing sort
    if (next) params.set("sort", next);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  function sortIndicator(column: string): string {
    const current = sortParam || "";
    if (current === `${column}_asc`) return " \u25B2";
    if (current === `${column}_desc`) return " \u25BC";
    return "";
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* 1. Title + DateRangeSelector */}
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
      <p className="text-muted mb-8">{t("subtitle")}</p>

      {/* 2. Contract Search */}
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3">{t("searchTitle")}</h2>
        <Suspense fallback={<div className="h-10 bg-card-bg border border-card-border rounded-lg animate-pulse" />}>
          <ContractSearchInput
            placeholder={t("searchPlaceholder")}
            initialQuery={searchQuery ?? ""}
          />
        </Suspense>
        {searchResults && (
          <div className="mt-4">
            {searchResults.totalCount > 0 ? (
              <>
                <p className="text-sm text-muted mb-3">
                  {t("searchResults", {
                    count: searchResults.totalCount.toLocaleString(localeTag),
                    query: searchResults.query,
                  })}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-card-border text-left">
                        <th className="py-2 pr-3"><a href={sortUrl("date")} className="hover:text-accent">{t("searchDate")}{sortIndicator("date")}</a></th>
                        <th className="py-2 pr-3"><a href={sortUrl("supplier")} className="hover:text-accent">{t("supplier")}{sortIndicator("supplier")}</a></th>
                        <th className="py-2 pr-3"><a href={sortUrl("service")} className="hover:text-accent">{t("department")}{sortIndicator("service")}</a></th>
                        <th className="py-2 pr-3 text-right"><a href={sortUrl("amount")} className="hover:text-accent">{t("searchAmount")}{sortIndicator("amount")}</a></th>
                        <th className="py-2 pr-3">{t("searchSource")}</th>
                        <th className="py-2">{t("searchDescription")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.results.map((r, i) => (
                        <tr key={`${r.approval_date}-${i}`} className="border-b border-card-border align-top">
                          <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">{r.approval_date}</td>
                          <td className="py-2 pr-3">{r.supplier}</td>
                          <td className="py-2 pr-3 text-xs">{r.service}</td>
                          <td className="py-2 pr-3 text-right font-mono whitespace-nowrap">{fmt(r.montant)}</td>
                          <td className="py-2 pr-3 text-xs">{r.source}</td>
                          <td className="py-2 text-xs text-muted max-w-xs truncate">{r.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {searchResults.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    {searchResults.page > 1 ? (
                      <a
                        href={buildUrl(searchResults.page - 1)}
                        className="text-sm text-accent hover:underline"
                      >
                        {t("searchPrev")}
                      </a>
                    ) : (
                      <span />
                    )}
                    <span className="text-sm text-muted">
                      {t("searchPage", { page: searchResults.page, total: searchResults.totalPages })}
                    </span>
                    {searchResults.page < searchResults.totalPages ? (
                      <a
                        href={buildUrl(searchResults.page + 1)}
                        className="text-sm text-accent hover:underline"
                      >
                        {t("searchNext")}
                      </a>
                    ) : (
                      <span />
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted italic">
                {t("searchNoResults", { query: searchResults.query })}
              </p>
            )}
          </div>
        )}
      </section>

      {/* 3. Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label={t("totalContracts")}
          value={stats.totalContracts.toLocaleString(localeTag)}
        />
        <StatCard
          label={t("totalValue")}
          value={fmtCompact(stats.totalValue)}
        />
        <StatCard
          label={t("avgValue")}
          value={fmtCompact(stats.avgValue)}
        />
        <StatCard
          label={t("medianValue")}
          value={fmtCompact(stats.medianValue)}
        />
      </div>

      {/* 4. Concentration callout */}
      <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-8">
        <h2 className="text-xl font-bold mb-2">{t("concentrationTitle")}</h2>
        <p className="text-muted text-sm mb-4">{t("concentrationSubtitle")}</p>
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-4xl font-bold text-accent">
            {Math.round(stats.top10ConcentrationPct)}%
          </span>
          <span className="text-muted">
            {t("concentrationDetail", { count: stats.topSuppliers.length })}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-left">
                <th className="py-2 pr-4">{t("supplier")}</th>
                <th className="py-2 pr-4 text-right">{t("contracts")}</th>
                <th className="py-2 pr-4 text-right">{t("totalAmount")}</th>
                <th className="py-2 text-right">{t("pctOfTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.topSuppliers.map((s) => (
                <tr key={s.name} className="border-b border-card-border">
                  <td className="py-2 pr-4">{s.name}</td>
                  <td className="py-2 pr-4 text-right font-mono">{s.count}</td>
                  <td className="py-2 pr-4 text-right font-mono">
                    {fmt(s.totalValue)}
                  </td>
                  <td className="py-2 text-right font-mono">
                    {stats.totalValue > 0
                      ? `${((s.totalValue / stats.totalValue) * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. Department-Supplier Loyalty */}
      <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-8">
        <h2 className="text-xl font-bold mb-2">{t("loyaltyTitle")}</h2>
        <p className="text-muted text-sm mb-4">{t("loyaltySubtitle")}</p>
        {loyalty.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border text-left">
                  <th className="py-2 pr-3">{t("loyaltyDepartment")}</th>
                  <th className="py-2 pr-3">{t("loyaltySupplier")}</th>
                  <th className="py-2 pr-3 text-right">{t("loyaltyContracts")}</th>
                  <th className="py-2 pr-3 text-right">{t("loyaltyValue")}</th>
                  <th className="py-2 text-right">{t("loyaltyPct")}</th>
                </tr>
              </thead>
              <tbody>
                {loyalty.map((pair, i) => (
                  <tr
                    key={`${pair.department}-${pair.supplier}-${i}`}
                    className={`border-b border-card-border ${pair.isHighConcentration ? "bg-amber-500/5" : ""}`}
                  >
                    <td className="py-2 pr-3 text-xs">{pair.department}</td>
                    <td className="py-2 pr-3">{pair.supplier}</td>
                    <td className="py-2 pr-3 text-right font-mono">{pair.contractCount}</td>
                    <td className="py-2 pr-3 text-right font-mono">{fmt(pair.totalValue)}</td>
                    <td className={`py-2 text-right font-mono ${pair.isHighConcentration ? "text-amber-500 font-medium" : ""}`}>
                      {pair.pctOfDeptSpend.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted italic">{t("loyaltyNone")}</p>
        )}
      </section>

      {/* 6. Supplier Growth Trajectories */}
      <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-8">
        <h2 className="text-xl font-bold mb-2">{t("growthTitle")}</h2>
        <p className="text-muted text-sm mb-4">{t("growthSubtitle")}</p>
        {growth.suppliers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border text-left">
                  <th className="py-2 pr-4">{t("growthSupplier")}</th>
                  <th className="py-2 pr-4 text-right">{t("growthEarly", { period: growth.earlyLabel })}</th>
                  <th className="py-2 pr-4 text-right">{t("growthLate", { period: growth.lateLabel })}</th>
                  <th className="py-2 text-right">{t("growthPct")}</th>
                </tr>
              </thead>
              <tbody>
                {growth.suppliers.map((g) => (
                  <tr key={g.supplier} className="border-b border-card-border">
                    <td className="py-2 pr-4">{g.supplier}</td>
                    <td className="py-2 pr-4 text-right font-mono">{fmt(g.earlyValue)}</td>
                    <td className="py-2 pr-4 text-right font-mono">{fmt(g.lateValue)}</td>
                    <td className={`py-2 text-right font-mono font-medium ${g.growthPct > 100 ? "text-amber-500" : ""}`}>
                      {g.growthPct > 0 ? "+" : ""}{g.growthPct.toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted italic">{t("growthNone")}</p>
        )}
      </section>

      {/* 7. Sole-source contracts */}
      <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-8">
        <h2 className="text-xl font-bold mb-2">{t("soleSourceTitle")}</h2>
        <p className="text-muted text-sm mb-4">{t("soleSourceSubtitle")}</p>
        {soleSource.totalCount > 0 ? (
          <>
            <p className="text-sm mb-4">
              {t("soleSourceTotal", {
                count: soleSource.totalCount.toLocaleString(localeTag),
                value: fmt(soleSource.totalValue),
              })}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Year trend table */}
              <div>
                <h3 className="text-sm font-semibold mb-2">{t("soleSourceYearTrend")}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-card-border text-left">
                        <th className="py-1.5 pr-3">{t("soleSourceYear")}</th>
                        <th className="py-1.5 pr-3 text-right">{t("soleSourceCount")}</th>
                        <th className="py-1.5 text-right">{t("soleSourceValue")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {soleSource.byYear.map((y) => (
                        <tr key={y.year} className="border-b border-card-border">
                          <td className="py-1.5 pr-3">{y.year}</td>
                          <td className="py-1.5 pr-3 text-right font-mono">{y.count}</td>
                          <td className="py-1.5 text-right font-mono">{fmt(y.totalValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Top recipients */}
              <div>
                <h3 className="text-sm font-semibold mb-2">{t("soleSourceTopRecipients")}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-card-border text-left">
                        <th className="py-1.5 pr-3">{t("supplier")}</th>
                        <th className="py-1.5 pr-3 text-right">{t("contracts")}</th>
                        <th className="py-1.5 text-right">{t("totalAmount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {soleSource.topRecipients.map((r) => (
                        <tr key={r.name} className="border-b border-card-border">
                          <td className="py-1.5 pr-3">{r.name}</td>
                          <td className="py-1.5 pr-3 text-right font-mono">{r.count}</td>
                          <td className="py-1.5 text-right font-mono">{fmt(r.totalValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted italic">{t("soleSourceNone")}</p>
        )}
      </section>

      {/* 8. Yearly spending by approval body */}
      {yearlyTrends.length > 0 && (
        <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-8">
          <h2 className="text-xl font-bold mb-2">{t("yearlyTrendTitle")}</h2>
          <p className="text-muted text-sm mb-4">{t("yearlyTrendSubtitle")}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border text-left">
                  <th className="py-2 pr-3">{t("yearlyTrendYear")}</th>
                  <th className="py-2 pr-3 text-right">{t("yearlyTrendFonctionnaires")}</th>
                  <th className="py-2 pr-3 text-right">{t("yearlyTrendConseilsArrondissement")}</th>
                  <th className="py-2 pr-3 text-right">{t("yearlyTrendComiteExecutif")}</th>
                  <th className="py-2 pr-3 text-right">{t("yearlyTrendConseilMunicipal")}</th>
                  <th className="py-2 pr-3 text-right">{t("yearlyTrendConseilAgglomeration")}</th>
                  <th className="py-2 text-right font-semibold">{t("yearlyTrendTotal")}</th>
                </tr>
              </thead>
              <tbody>
                {yearlyTrends.map((y) => (
                  <tr key={y.year} className="border-b border-card-border">
                    <td className="py-2 pr-3 font-medium">{y.year}</td>
                    <td className="py-2 pr-3 text-right font-mono">{fmt(y.fonctionnaires)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{fmt(y.conseils_arrondissement)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{fmt(y.comite_executif)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{fmt(y.conseil_municipal)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{fmt(y.conseil_agglomeration)}</td>
                    <td className="py-2 text-right font-mono font-semibold">{fmt(y.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 9. Monthly Spending Patterns */}
      <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-8">
        <h2 className="text-xl font-bold mb-2">{t("monthlyTitle")}</h2>
        <p className="text-muted text-sm mb-4">{t("monthlySubtitle")}</p>
        {monthlyDist.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border text-left">
                  <th className="py-2 pr-4">{t("monthlyMonth")}</th>
                  <th className="py-2 pr-4 text-right">{t("monthlyContracts")}</th>
                  <th className="py-2 text-right">{t("monthlyValue")}</th>
                </tr>
              </thead>
              <tbody>
                {monthlyDist.map((m) => (
                  <tr
                    key={m.month}
                    className={`border-b border-card-border ${m.isOutlier ? "bg-amber-500/5" : ""}`}
                  >
                    <td className={`py-2 pr-4 ${m.isOutlier ? "font-medium text-amber-500" : ""}`}>
                      {getMonthName(m.month, locale)}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono">
                      {m.count.toLocaleString(localeTag)}
                    </td>
                    <td className="py-2 text-right font-mono">{fmt(m.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted italic">{t("monthlyNone")}</p>
        )}
      </section>

      {/* 10. Contract value distribution histogram */}
      <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-8">
        <h2 className="text-xl font-bold mb-2">{t("distributionTitle")}</h2>
        <p className="text-muted text-sm mb-4">{t("distributionSubtitle")}</p>
        <ContractHistogram
          data={stats.distribution}
          locale={locale}
          labels={{
            yAxis: t("distributionYAxis"),
            tooltipCount: t("contracts"),
            tooltipValue: t("totalAmount"),
          }}
        />
        <p className="text-xs text-muted mt-4 text-center">
          {t("distributionFootnote")}
        </p>
      </section>

      {/* 11. Threshold clustering analysis */}
      <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-8">
        <h2 className="text-xl font-bold mb-2">{t("thresholdTitle")}</h2>
        <p className="text-muted text-sm mb-4">{t("thresholdSubtitle")}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats.thresholdClusters.map((tc) => {
            const ratio = tc.expected > 0 ? tc.count / tc.expected : 0;
            const isElevated = ratio > 1.5;
            return (
              <div
                key={`${tc.threshold}-${tc.period}`}
                className={`border rounded-lg p-4 ${
                  isElevated
                    ? "border-amber-500/50 bg-amber-500/5"
                    : "border-card-border bg-card-bg"
                }`}
              >
                <p className="text-sm font-semibold mb-1">
                  {t("thresholdLabel", { threshold: tc.label })}
                  {tc.period && (
                    <span className="text-xs font-normal text-muted ml-2">({tc.period})</span>
                  )}
                </p>
                <p className="text-3xl font-bold">
                  {tc.count}
                  <span className="text-lg font-normal text-muted ml-2">
                    {t("contracts").toLowerCase()}
                  </span>
                </p>
                <p className="text-sm text-muted mt-1">
                  {t("thresholdExpected", { expected: tc.expected })}
                </p>
                {isElevated && (
                  <p className="text-sm text-amber-500 mt-1 font-medium">
                    {t("thresholdElevated", { ratio: ratio.toFixed(1) })}
                  </p>
                )}
                <p className="text-xs text-muted mt-2 border-t border-card-border pt-2">
                  {t("belowThreshold", {
                    count: tc.belowThreshold.toLocaleString(localeTag),
                    total: tc.totalInEra.toLocaleString(localeTag),
                    pct: tc.totalInEra > 0
                      ? ((tc.belowThreshold / tc.totalInEra) * 100).toFixed(1)
                      : "0",
                  })}
                </p>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted mt-4">
          {t.rich("thresholdMethodology", {
            lcv: (chunks) => (
              <a
                href="https://www.legisquebec.gouv.qc.ca/fr/document/lc/C-19/20241206#se:573_3_1_2"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                {chunks}
              </a>
            ),
            mamh: (chunks) => (
              <a
                href="https://www.quebec.ca/gouvernement/gestion-municipale/gestion-contrats-municipaux/sollicitation-adjudication/conformite-liberalisation-marches-publics"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      </section>

      {/* 12. Round-Number Clustering */}
      <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-8">
        <h2 className="text-xl font-bold mb-2">{t("roundNumberTitle")}</h2>
        <p className="text-muted text-sm mb-4">{t("roundNumberSubtitle")}</p>
        {roundNumbers.length > 0 ? (
          <div className="space-y-6">
            {roundNumbers.map((group) => (
              <div key={group.threshold}>
                <h3 className="text-sm font-semibold mb-2">
                  {t("thresholdLabel", { threshold: group.label })}
                  <span className="text-xs font-normal text-muted ml-2">
                    ({group.totalBelow} {t("contracts").toLowerCase()})
                  </span>
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-card-border text-left">
                        <th className="py-1.5 pr-4">{t("roundNumberAmount")}</th>
                        <th className="py-1.5 text-right">{t("roundNumberCount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.clusters.map((c) => {
                        const isTopAmount = c.amount === group.threshold - 1 || c.count >= 10;
                        return (
                          <tr
                            key={c.amount}
                            className={`border-b border-card-border ${isTopAmount ? "bg-amber-500/5" : ""}`}
                          >
                            <td className={`py-1.5 pr-4 font-mono ${isTopAmount ? "font-medium text-amber-500" : ""}`}>
                              {fmt(c.amount)}
                            </td>
                            <td className="py-1.5 text-right font-mono">{c.count}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted mt-2">
                  {t("roundNumberComparison", { count: group.comparisonBandCount })}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted italic">{t("roundNumberNone")}</p>
        )}
      </section>

      {/* 13. Potential contract splitting */}
      <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-8">
        <h2 className="text-xl font-bold mb-2">{t("splitTitle")}</h2>
        <p className="text-muted text-sm mb-4">{t("splitSubtitle")}</p>
        {stats.splitCandidates.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-card-border text-left">
                    <th className="py-2 pr-4">{t("splitSupplier")}</th>
                    <th className="py-2 pr-4 text-right">{t("splitContracts")}</th>
                    <th className="py-2 pr-4 text-right">{t("splitCombined")}</th>
                    <th className="py-2 pr-4 text-right">{t("splitAvg")}</th>
                    <th className="py-2 pr-4">{t("splitDateRange")}</th>
                    <th className="py-2 text-right">{t("splitDays")}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.splitCandidates.map((sc, i) => {
                    const isHighRisk = sc.contractCount >= 3 && sc.daySpan <= 60;
                    return (
                      <tr
                        key={`${sc.supplier}-${i}`}
                        className={`border-b border-card-border ${
                          isHighRisk ? "bg-amber-500/5" : ""
                        }`}
                      >
                        <td className={`py-2 pr-4 ${isHighRisk ? "font-medium" : ""}`}>
                          {sc.supplier}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono">{sc.contractCount}</td>
                        <td className="py-2 pr-4 text-right font-mono">{fmt(sc.combinedValue)}</td>
                        <td className="py-2 pr-4 text-right font-mono">{fmt(sc.avgValue)}</td>
                        <td className="py-2 pr-4">{sc.dateRange}</td>
                        <td className="py-2 text-right font-mono">{sc.daySpan}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted mt-4">{t("splitMethodology")}</p>
          </>
        ) : (
          <p className="text-sm text-muted italic">{t("splitNone")}</p>
        )}
      </section>

      {/* 14. Top departments */}
      <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-8">
        <h2 className="text-xl font-bold mb-4">{t("topDepartments")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-left">
                <th className="py-2 pr-4">{t("department")}</th>
                <th className="py-2 pr-4 text-right">{t("contracts")}</th>
                <th className="py-2 text-right">{t("totalAmount")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.topDepartments.map((d) => (
                <tr key={d.name} className="border-b border-card-border">
                  <td className="py-2 pr-4">{d.name}</td>
                  <td className="py-2 pr-4 text-right font-mono">{d.count}</td>
                  <td className="py-2 text-right font-mono">
                    {fmt(d.totalValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 15. Notable findings */}
      <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-8">
        <h2 className="text-xl font-bold mb-2">{t("notableFindingsTitle")}</h2>
        <p className="text-muted text-sm mb-6">{t("notableFindingsSubtitle")}</p>
        <div className="space-y-6">
          <div className="border-l-4 border-amber-500 pl-4">
            <h3 className="font-semibold mb-1">{t("findingSoleSourceGrowthTitle")}</h3>
            <p className="text-sm text-muted">{t("findingSoleSourceGrowthBody")}</p>
          </div>
          <div className="border-l-4 border-amber-500 pl-4">
            <h3 className="font-semibold mb-1">{t("findingDurokingTitle")}</h3>
            <p className="text-sm text-muted">{t("findingDurokingBody")}</p>
          </div>
          <div className="border-l-4 border-amber-500 pl-4">
            <h3 className="font-semibold mb-1">{t("findingSingleBidderTitle")}</h3>
            <p className="text-sm text-muted">{t("findingSingleBidderBody")}</p>
          </div>
        </div>
      </section>

      {/* 16. Supplier name normalization */}
      <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-8">
        <h2 className="text-xl font-bold mb-2">{t("normalizationTitle")}</h2>
        <p className="text-muted text-sm mb-2">{t("normalizationSubtitle")}</p>
        <p className="text-muted text-sm mb-4">{t("normalizationExplanation")}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-left">
                <th className="py-2 pr-4">{t("normalizationCanonical")}</th>
                <th className="py-2 pr-4 text-right">{t("normalizationVariants")}</th>
                <th className="py-2">{t("normalizationExamples")}</th>
              </tr>
            </thead>
            <tbody>
              {normExamples.map((ex) => (
                <tr key={ex.canonical} className="border-b border-card-border align-top">
                  <td className="py-2 pr-4 font-medium">{ex.canonical}</td>
                  <td className="py-2 pr-4 text-right font-mono">
                    {t("normalizationCount", { count: ex.variantCount })}
                  </td>
                  <td className="py-2 text-xs text-muted">
                    {ex.sampleVariants.map((v, i) => (
                      <span key={i}>
                        {i > 0 && <br />}
                        {v}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 17. Methodology */}
      <section className="text-sm text-muted">
        <h3 className="font-semibold text-foreground mb-2">{t("methodology")}</h3>
        <p>{t("methodologyText")}</p>
      </section>
    </div>
  );
}
