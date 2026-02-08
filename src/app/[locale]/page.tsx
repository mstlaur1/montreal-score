import { getTranslations, setRequestLocale } from "next-intl/server";
import { getBoroughScores, getBoroughPermitStats, getCitySummary } from "@/lib/data";
import { PERMIT_TARGET_DAYS } from "@/lib/scoring";
import { BoroughCard } from "@/components/BoroughCard";
import { StatCard } from "@/components/StatCard";
import { Link } from "@/i18n/navigation";

export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("HomePage");

  const currentYear = new Date().getFullYear();
  let scores, stats, summary;

  try {
    [scores, stats, summary] = await Promise.all([
      getBoroughScores(currentYear),
      getBoroughPermitStats(currentYear),
      getCitySummary(currentYear),
    ]);
  } catch {
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
          {t("heroSubtitle")}
        </p>
      </section>

      {/* City-wide Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        <StatCard
          label={t("medianDelay")}
          value={Math.round(summary.median_processing_days)}
          unit={t("days")}
          detail={t("targetDetail", { target: PERMIT_TARGET_DAYS })}
          trend={summary.trend_vs_last_year < -5 ? "down" : summary.trend_vs_last_year > 5 ? "up" : "flat"}
          trendLabel={
            summary.trend_vs_last_year < 0
              ? t("daysLessThanLastYear", { count: Math.abs(Math.round(summary.trend_vs_last_year)) })
              : t("daysMoreThanLastYear", { count: Math.round(summary.trend_vs_last_year) })
          }
        />
        <StatCard
          label={t("onTime")}
          value={Math.round(summary.pct_within_target)}
          unit="%"
          detail={t("permitsWithinTarget", { target: PERMIT_TARGET_DAYS })}
        />
        <StatCard
          label={t("bestBorough")}
          value={summary.best_borough}
        />
        <StatCard
          label={t("worstBorough")}
          value={summary.worst_borough}
        />
      </section>

      {/* Borough Rankings */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">{t("boroughRankings")}</h2>
          <Link href="/permits" className="text-sm text-accent hover:underline">
            {t("viewPermitDetails")} &rarr;
          </Link>
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
          {t("ctaTitle")}
        </h2>
        <p className="text-muted max-w-lg mx-auto">
          {t("ctaBody")}
        </p>
      </section>
    </div>
  );
}
