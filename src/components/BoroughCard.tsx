import type { BoroughScore } from "@/lib/types";
import { GradeBadge } from "./GradeBadge";

interface BoroughCardProps {
  score: BoroughScore;
  rank: number;
  medianDays?: number;
  pctWithinTarget?: number;
}

export function BoroughCard({ score, rank, medianDays, pctWithinTarget }: BoroughCardProps) {
  return (
    <a
      href={`/boroughs/${score.slug}`}
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
                {Math.round(medianDays)} jours médians
              </span>
            )}
            {pctWithinTarget !== undefined && (
              <span>{Math.round(pctWithinTarget)}% dans les délais</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold">{score.overall_score}</span>
          <span className="text-xs text-muted">/100</span>
        </div>
      </div>
    </a>
  );
}
