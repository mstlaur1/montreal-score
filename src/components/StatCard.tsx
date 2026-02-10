interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  detail?: string;
  trend?: "up" | "down" | "flat";
  trendLabel?: string;
}

export function StatCard({ label, value, unit, detail, trend, trendLabel }: StatCardProps) {
  const trendIcon = trend === "up" ? "\u2191" : trend === "down" ? "\u2193" : "\u2192";
  const trendColor =
    trend === "down" ? "text-grade-a" : trend === "up" ? "text-grade-f" : "text-muted";

  return (
    <div className="border border-card-border rounded-xl p-4 bg-card-bg">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-xl sm:text-2xl md:text-3xl font-bold mt-1 break-words">
        {value}
        {unit && <span className="text-lg font-normal text-muted ml-1">{unit}</span>}
      </p>
      {detail && <p className="text-xs text-muted mt-1">{detail}</p>}
      {trend && trendLabel && (
        <p className={`text-sm mt-2 ${trendColor}`}>
          {trendIcon} {trendLabel}
        </p>
      )}
    </div>
  );
}
