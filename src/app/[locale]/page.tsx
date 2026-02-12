import { getTranslations, setRequestLocale } from "next-intl/server";
import { getCitySummary, getPromiseSummary, getContractStats, getSRSummary } from "@/lib/data";
import { getContractDateBounds } from "@/lib/db";
import { PERMIT_TARGET_DAYS } from "@/lib/scoring";
import { getJurisdiction } from "@/lib/jurisdiction";
import { Link } from "@/i18n/navigation";

export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string }>;
};

function formatCurrency(value: number, locale: string): string {
  const localeTag = locale === "fr" ? "fr-CA" : "en-CA";
  if (Math.abs(value) >= 1_000_000) {
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

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("HomePage");
  const jx = getJurisdiction();

  const currentYear = new Date().getFullYear();

  // Permits — use current year, fall back to previous if housing data is sparse
  let permitSummary = await getCitySummary(currentYear);
  if (permitSummary.housing_permits_ytd < 10) {
    permitSummary = await getCitySummary(currentYear - 1);
  }

  // Promises
  const promiseSummary = await getPromiseSummary();

  // Contracts — last 12 months
  const bounds = getContractDateBounds();
  const now = new Date();
  const toMonth = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  const fromDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const fromMonth = fromDate.getFullYear() + "-" + String(fromDate.getMonth() + 1).padStart(2, "0");
  const contractFrom = fromMonth > bounds.min ? fromMonth + "-01" : bounds.min + "-01";
  const toNext = now.getMonth() === 11
    ? (now.getFullYear() + 1) + "-01-01"
    : now.getFullYear() + "-" + String(now.getMonth() + 2).padStart(2, "0") + "-01";
  const contractTo = toMonth <= bounds.max ? toNext : bounds.max + "-01";
  const contractStats = await getContractStats(contractFrom, contractTo);

  // 311 — current year, fall back to previous
  let srSummary = await getSRSummary(currentYear);
  if (!srSummary || srSummary.totalRequests < 100) {
    srSummary = await getSRSummary(currentYear - 1);
  }

  // Promise progress bar widths
  const pTotal = promiseSummary.total || 1;
  const pCompletedPct = (promiseSummary.completed / pTotal) * 100;
  const pInProgressPct = (promiseSummary.in_progress / pTotal) * 100;
  const pPartialPct = (promiseSummary.partially_met / pTotal) * 100;
  const pBrokenPct = (promiseSummary.broken / pTotal) * 100;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Hero */}
      <section className="text-center py-12">
        <h1 className="text-4xl font-bold tracking-tight">
          {jx.brandPrefix}<span className="text-accent">{jx.brandAccent}</span>
        </h1>
        <p className="text-lg text-muted mt-3 max-w-2xl mx-auto">
          {t("heroSubtitle")}
        </p>
      </section>

      <div className="space-y-8">
        {/* Promises */}
        <section className="border border-card-border rounded-xl p-6 bg-card-bg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">{t("promisesTitle")}</h2>
            <Link href="/promises" className="text-sm text-accent hover:underline">
              {t("viewPromises")} &rarr;
            </Link>
          </div>
          <p className="text-sm text-muted mb-3">
            {t("promisesTracked", { count: promiseSummary.total })}
          </p>
          {/* Progress bar */}
          <div
            className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex"
            role="progressbar"
            aria-valuenow={Math.round(pCompletedPct + pPartialPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("promisesTracked", { count: promiseSummary.total })}
          >
            {pCompletedPct > 0 && (
              <div className="bg-green-700 h-full" style={{ width: `${pCompletedPct}%` }} />
            )}
            {pPartialPct > 0 && (
              <div className="bg-emerald-400 h-full" style={{ width: `${pPartialPct}%` }} />
            )}
            {pInProgressPct > 0 && (
              <div className="bg-yellow-400 h-full" style={{ width: `${pInProgressPct}%` }} />
            )}
            {pBrokenPct > 0 && (
              <div className="bg-red-500 h-full" style={{ width: `${pBrokenPct}%` }} />
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted">
            {promiseSummary.completed > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-green-700 inline-block" />
                {t("promisesCompleted", { count: promiseSummary.completed })}
              </span>
            )}
            {promiseSummary.partially_met > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                {t("promisesPartial", { count: promiseSummary.partially_met })}
              </span>
            )}
            {promiseSummary.in_progress > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" />
                {t("promisesInProgress", { count: promiseSummary.in_progress })}
              </span>
            )}
            {promiseSummary.broken > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                {t("promisesBroken", { count: promiseSummary.broken })}
              </span>
            )}
          </div>
        </section>

        {/* Permits */}
        <section className="border border-card-border rounded-xl p-6 bg-card-bg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">{t("permitsTitle")}</h2>
            <Link href="/permits" className="text-sm text-accent hover:underline">
              {t("viewPermits")} &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted">{t("housingMedian")}</p>
              <p className="text-2xl font-bold">
                {Math.round(permitSummary.housing_median_days)}
                <span className="text-sm font-normal text-muted ml-1">{t("days")}</span>
              </p>
              <p className="text-xs text-muted">{t("targetDetail", { target: PERMIT_TARGET_DAYS })}</p>
            </div>
            <div>
              <p className="text-sm text-muted">{t("onTime")}</p>
              <p className="text-2xl font-bold">
                {Math.round(permitSummary.housing_pct_within_target)}
                <span className="text-sm font-normal text-muted ml-1">%</span>
              </p>
              <p className="text-xs text-muted">{t("permitsWithinTarget", { target: PERMIT_TARGET_DAYS })}</p>
            </div>
            <div>
              <p className="text-sm text-muted">{t("bestBorough")}</p>
              <p className="text-lg font-semibold">{permitSummary.best_borough}</p>
            </div>
            <div>
              <p className="text-sm text-muted">{t("worstBorough")}</p>
              <p className="text-lg font-semibold">{permitSummary.worst_borough}</p>
            </div>
          </div>
        </section>

        {/* Contracts */}
        <section className="border border-card-border rounded-xl p-6 bg-card-bg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">{t("contractsTitle")}</h2>
            <Link href="/contracts" className="text-sm text-accent hover:underline">
              {t("viewContracts")} &rarr;
            </Link>
          </div>
          <p className="text-xs text-muted mb-3">{t("contractsPeriod")}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted">{t("totalContracts", { count: contractStats.totalContracts.toLocaleString() })}</p>
              <p className="text-2xl font-bold">{formatCurrency(contractStats.totalValue, locale)}</p>
              <p className="text-xs text-muted">{t("totalValue")}</p>
            </div>
            <div>
              <p className="text-sm text-muted">{t("topSupplier")}</p>
              <p className="text-lg font-semibold truncate">
                {contractStats.topSuppliers[0]?.name ?? "—"}
              </p>
              <p className="text-xs text-muted">
                {contractStats.topSuppliers[0]
                  ? formatCurrency(contractStats.topSuppliers[0].totalValue, locale)
                  : ""}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">{t("top10Suppliers")}</p>
              <p className="text-2xl font-bold">
                {Math.round(contractStats.top10ConcentrationPct)}
                <span className="text-sm font-normal text-muted ml-1">%</span>
              </p>
              <p className="text-xs text-muted">
                {t("ofSpending")}
              </p>
            </div>
          </div>
        </section>
        {/* 311 Service Requests */}
        {srSummary && (
          <section className="border border-card-border rounded-xl p-6 bg-card-bg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{t("sr311Title")}</h2>
              <Link href="/311" className="text-sm text-accent hover:underline">
                {t("viewSR311")} &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted">{t("sr311Total")}</p>
                <p className="text-2xl font-bold">
                  {srSummary.totalRequestsAll.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA")}
                </p>
                <p className="text-xs text-muted">{t("sr311Requests")}</p>
              </div>
              <div>
                <p className="text-sm text-muted">{t("sr311Resolution")}</p>
                <p className="text-2xl font-bold">
                  {Math.round(srSummary.resolutionRate)}
                  <span className="text-sm font-normal text-muted ml-1">%</span>
                </p>
                <p className="text-xs text-muted">{t("sr311Completed", { count: srSummary.totalCompleted.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA") })}</p>
              </div>
              <div>
                <p className="text-sm text-muted">{t("sr311ResponseTime")}</p>
                <p className="text-2xl font-bold">
                  {srSummary.avgResponseDays != null ? Math.round(srSummary.avgResponseDays) : "—"}
                  {srSummary.avgResponseDays != null && (
                    <span className="text-sm font-normal text-muted ml-1">{t("days")}</span>
                  )}
                </p>
                <p className="text-xs text-muted">{t("sr311AvgDays")}</p>
              </div>
              <div>
                <p className="text-sm text-muted">{t("sr311TopCategory")}</p>
                <p className="text-lg font-semibold truncate">{srSummary.topCategory}</p>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Volunteer CTA */}
      <section className="border border-card-border rounded-xl p-6 bg-card-bg mt-8">
        <h2 className="text-xl font-bold mb-2">{t("volunteerTitle")}</h2>
        <p className="text-muted text-sm mb-4">{t("volunteerBody")}</p>
        <Link
          href="/about#contact"
          className="inline-block px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          {t("volunteerCta")} &rarr;
        </Link>
      </section>

      {/* CTA */}
      <section className="text-center py-12 border-t border-card-border">
        <h2 className="text-xl font-bold mb-2">
          {t("ctaTitle")}
        </h2>
        <p className="text-muted max-w-lg mx-auto">
          {t("ctaBody")}
        </p>
      </section>
    </div>
  );
}
