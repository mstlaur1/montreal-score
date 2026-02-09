"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import type { YearlyPermitTrend } from "@/lib/data";

interface PermitYoYChartProps {
  trends: YearlyPermitTrend[];
  labels: {
    yoyTitle: string;
    yoyYAxis: string;
  };
}

export function PermitYoYChart({ trends, labels }: PermitYoYChartProps) {
  if (trends.length < 2) return null;

  const chartData = trends.slice(1).map((row, i) => {
    const prev = trends[i].total;
    const pctChange = prev > 0 ? ((row.total - prev) / prev) * 100 : 0;
    return { year: row.year, pctChange: Math.round(pctChange * 10) / 10 };
  });

  return (
    <section className="border border-card-border rounded-xl p-6 bg-card-bg">
      <h2 className="text-xl font-bold mb-4">{labels.yoyTitle}</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis dataKey="year" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 12 }}
            label={{ value: labels.yoyYAxis, angle: -90, position: "insideLeft", fontSize: 12 }}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            formatter={(value: number) => [`${value}%`, labels.yoyYAxis]}
            contentStyle={{
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "8px",
            }}
          />
          <ReferenceLine y={0} stroke="var(--muted)" />
          <Bar dataKey="pctChange" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.pctChange >= 0 ? "var(--grade-a)" : "var(--grade-f)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
