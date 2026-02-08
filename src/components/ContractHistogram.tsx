"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface DistributionBucket {
  label: string;
  min: number;
  max: number;
  count: number;
  totalValue: number;
}

interface ContractHistogramProps {
  data: DistributionBucket[];
  locale: string;
  labels: {
    yAxis: string;
    tooltipCount: string;
    tooltipValue: string;
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

export function ContractHistogram({ data, locale, labels }: ContractHistogramProps) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          angle={-30}
          textAnchor="end"
          height={60}
        />
        <YAxis
          label={{ value: labels.yAxis, angle: -90, position: "insideLeft" }}
          tick={{ fontSize: 12 }}
        />
        <Tooltip
          formatter={(value: number, name: string) => {
            if (name === "count") return [value, labels.tooltipCount];
            return [formatCurrency(value, locale), labels.tooltipValue];
          }}
          contentStyle={{
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: "8px",
          }}
        />
        {/* Threshold markers via colored bars */}
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => {
            // Highlight the buckets that border procurement thresholds
            const isThresholdBucket =
              entry.label === "10K–25K" || entry.label === "100K–134K";
            return (
              <Cell
                key={index}
                fill={isThresholdBucket ? "var(--accent)" : "hsl(210, 60%, 50%)"}
                opacity={isThresholdBucket ? 1 : 0.7}
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
