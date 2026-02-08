import type { BoroughScore } from "@/lib/types";
import { getTranslations } from "next-intl/server";
import { GradeBadge } from "./GradeBadge";

interface BoroughCardProps {
  score: BoroughScore;
  rank: number;
  medianDays?: number;
  pctWithinTarget?: number;
}

export async function BoroughCard({ score, rank, medianDays, pctWithinTarget }: BoroughCardProps) {
  const t = await getTranslations("BoroughCard");

  return (
    <div
      className="block border border-card-border rounded-xl p-4 bg-card-bg hover:border-accent transition-colors"
    >
      <div className="flex items-center gap-4">
        <span className="text-muted text-sm font-mono w-6">#{rank}</span>
        <GradeBadge grade={score.overall_grade} size="sm" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{score.borough}</h3>
          <div className="flex gap-4 text-xs text-muted mt-1">
            {medianDays !== undefined && (
              <span>
                {t("medianDays", { count: Math.round(medianDays) })}
              </span>
            )}
            {pctWithinTarget !== undefined && (
              <span>{t("withinTarget", { pct: Math.round(pctWithinTarget) })}</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold">{score.overall_score}</span>
          <span className="text-xs text-muted">/100</span>
        </div>
      </div>
    </div>
  );
}
