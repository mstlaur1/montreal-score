import { getBoroughComparisonData, getCitySummary, getYearlyTrendData } from "@/lib/data";
import { PERMIT_TARGET_DAYS, PREVIOUS_TARGET_DAYS } from "@/lib/scoring";
import { PermitBarChart } from "@/components/PermitBarChart";
import { StatCard } from "@/components/StatCard";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export const metadata = {
  title: "Permis de construction — MontréalScore",
  description:
    "Suivi des délais de traitement des permis de construction par arrondissement à Montréal.",
};

export default async function PermitsPage() {
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

  const chartData = comparison.map((c) => ({
    borough: c.borough,
    medianDays: c.value,
    grade: c.grade,
  }));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Permis de construction</h1>
      <p className="text-muted mb-8">
        Délais de traitement par arrondissement vs la cible de {PERMIT_TARGET_DAYS} jours
        (promesse de la mairesse Martinez Ferrada). L&apos;ancienne cible était de{" "}
        {PREVIOUS_TARGET_DAYS} jours.
      </p>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Permis cette année"
          value={summary.total_permits_ytd.toLocaleString("fr-CA")}
        />
        <StatCard
          label="Délai médian"
          value={Math.round(summary.median_processing_days)}
          unit="jours"
        />
        <StatCard
          label="Dans la cible de 90j"
          value={Math.round(summary.pct_within_target)}
          unit="%"
        />
        <StatCard
          label="Tendance"
          value={
            summary.trend_vs_last_year < 0
              ? Math.abs(Math.round(summary.trend_vs_last_year))
              : `+${Math.round(summary.trend_vs_last_year)}`
          }
          unit="jours"
          detail="vs l'an dernier"
          trend={summary.trend_vs_last_year < -5 ? "down" : summary.trend_vs_last_year > 5 ? "up" : "flat"}
          trendLabel={summary.trend_vs_last_year < 0 ? "Amélioration" : "Détérioration"}
        />
      </div>

      {/* Borough comparison chart */}
      <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-8">
        <h2 className="text-xl font-bold mb-4">
          Délai médian par arrondissement
        </h2>
        <PermitBarChart data={chartData} targetDays={PERMIT_TARGET_DAYS} />
        <p className="text-xs text-muted mt-4 text-center">
          Ligne verte pointillée = cible de {PERMIT_TARGET_DAYS} jours.
          Couleurs selon la note de l&apos;arrondissement.
        </p>
      </section>

      {/* Historical trends */}
      <section className="border border-card-border rounded-xl p-6 bg-card-bg">
        <h2 className="text-xl font-bold mb-4">Tendance historique</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-left">
                <th className="py-2 pr-4">Année</th>
                <th className="py-2">Permis déposés</th>
              </tr>
            </thead>
            <tbody>
              {trends.map(
                (t: { year: number; totalPermits: number }) => (
                  <tr key={t.year} className="border-b border-card-border">
                    <td className="py-2 pr-4 font-mono">{t.year}</td>
                    <td className="py-2">
                      {t.totalPermits.toLocaleString("fr-CA")}
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
        <h3 className="font-semibold text-foreground mb-2">Méthodologie</h3>
        <p>
          Les délais sont calculés à partir des champs <code>date_debut</code>{" "}
          (date de demande) et <code>date_emission</code> (date d&apos;émission) du
          jeu de données ouvert de la Ville de Montréal. Le délai médian est
          utilisé plutôt que la moyenne pour réduire l&apos;impact des cas extrêmes.
          Les données sont mises à jour chaque semaine par la Ville.
        </p>
      </section>
    </div>
  );
}
