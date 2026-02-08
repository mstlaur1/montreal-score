import { getBoroughScores, getBoroughPermitStats, getCitySummary } from "@/lib/data";
import { PERMIT_TARGET_DAYS } from "@/lib/scoring";
import { GradeBadge } from "@/components/GradeBadge";
import { BoroughCard } from "@/components/BoroughCard";
import { StatCard } from "@/components/StatCard";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function Home() {
  const currentYear = new Date().getFullYear();
  let scores, stats, summary;

  try {
    [scores, stats, summary] = await Promise.all([
      getBoroughScores(currentYear),
      getBoroughPermitStats(currentYear),
      getCitySummary(currentYear),
    ]);
  } catch {
    // If current year has no data yet, fall back to previous year
    const fallbackYear = currentYear - 1;
    [scores, stats, summary] = await Promise.all([
      getBoroughScores(fallbackYear),
      getBoroughPermitStats(fallbackYear),
      getCitySummary(fallbackYear),
    ]);
  }

  const statsLookup = new Map(stats.map((s) => [s.slug, s]));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Hero */}
      <section className="text-center py-12">
        <h1 className="text-4xl font-bold tracking-tight">
          Montréal<span className="text-accent">Score</span>
        </h1>
        <p className="text-lg text-muted mt-3 max-w-2xl mx-auto">
          Votre gouvernement municipal est-il performant? Notes de performance
          pour chaque arrondissement, basées sur les données ouvertes de la Ville.
        </p>
      </section>

      {/* City-wide Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        <StatCard
          label="Délai médian"
          value={Math.round(summary.median_processing_days)}
          unit="jours"
          detail={`Cible: ${PERMIT_TARGET_DAYS} jours`}
          trend={summary.trend_vs_last_year < -5 ? "down" : summary.trend_vs_last_year > 5 ? "up" : "flat"}
          trendLabel={
            summary.trend_vs_last_year < 0
              ? `${Math.abs(Math.round(summary.trend_vs_last_year))}j de moins que l'an dernier`
              : `${Math.round(summary.trend_vs_last_year)}j de plus que l'an dernier`
          }
        />
        <StatCard
          label="Dans les délais"
          value={Math.round(summary.pct_within_target)}
          unit="%"
          detail={`Permis traités en ≤${PERMIT_TARGET_DAYS} jours`}
        />
        <StatCard
          label="Meilleur arrondissement"
          value={summary.best_borough}
        />
        <StatCard
          label="Pire arrondissement"
          value={summary.worst_borough}
        />
      </section>

      {/* Borough Rankings */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Classement des arrondissements</h2>
          <a href="/permits" className="text-sm text-accent hover:underline">
            Voir les détails des permis &rarr;
          </a>
        </div>
        <div className="flex flex-col gap-2">
          {scores.map((score, i) => {
            const st = statsLookup.get(score.slug);
            return (
              <BoroughCard
                key={score.slug}
                score={score}
                rank={i + 1}
                medianDays={st?.median_processing_days}
                pctWithinTarget={st?.pct_within_90_days}
              />
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="text-center py-12 mt-8 border-t border-card-border">
        <h2 className="text-xl font-bold mb-2">
          La mairesse a promis 90 jours. On vérifie.
        </h2>
        <p className="text-muted max-w-lg mx-auto">
          Toutes les données proviennent du portail de données ouvertes de la
          Ville de Montréal. Mises à jour chaque semaine. Aucune opinion —
          seulement les chiffres.
        </p>
      </section>
    </div>
  );
}
