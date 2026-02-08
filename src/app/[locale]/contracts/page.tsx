import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getContractStats } from "@/lib/data";
import { StatCard } from "@/components/StatCard";
import { ContractHistogram } from "@/components/ContractHistogram";

export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ContractsPage" });
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

function formatCurrency(value: number, locale: string): string {
  const localeTag = locale === "fr" ? "fr-CA" : "en-CA";
  return new Intl.NumberFormat(localeTag, {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function ContractsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("ContractsPage");

  const currentYear = new Date().getFullYear();
  const stats = await getContractStats(currentYear);

  const localeTag = locale === "fr" ? "fr-CA" : "en-CA";
  const fmt = (v: number) => formatCurrency(v, locale);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
      <p className="text-muted mb-8">{t("subtitle")}</p>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label={t("totalContracts")}
          value={stats.totalContracts.toLocaleString(localeTag)}
        />
        <StatCard
          label={t("totalValue")}
          value={fmt(stats.totalValue)}
        />
        <StatCard
          label={t("avgValue")}
          value={fmt(stats.avgValue)}
        />
        <StatCard
          label={t("medianValue")}
          value={fmt(stats.medianValue)}
        />
      </div>

      {/* Concentration callout */}
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

      {/* Contract value distribution histogram */}
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

      {/* Threshold clustering analysis */}
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

      {/* Top departments */}
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

      {/* Methodology */}
      <section className="text-sm text-muted">
        <h3 className="font-semibold text-foreground mb-2">{t("methodology")}</h3>
        <p>{t("methodologyText")}</p>
      </section>
    </div>
  );
}
