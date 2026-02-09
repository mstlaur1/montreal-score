"use client";

import { useState } from "react";
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

type FilterKey = "all" | "housing" | "TR" | "CO" | "DE" | "CA";

interface PermitTrendSectionProps {
  trends: Record<string, YearlyPermitTrend[]>;
  labels: {
    filterLabel: string;
    filterAll: string;
    filterHousing: string;
    filterTR: string;
    filterCO: string;
    filterDE: string;
    filterCA: string;
    year: string;
    permitsFiled: string;
    medianDays: string;
    historicalTrend: string;
    days: string;
    yoyTitle: string;
    yoyYAxis: string;
  };
  locale: string;
}

const FILTER_OPTIONS: { key: FilterKey; labelKey: keyof PermitTrendSectionProps["labels"] }[] = [
  { key: "all", labelKey: "filterAll" },
  { key: "housing", labelKey: "filterHousing" },
  { key: "TR", labelKey: "filterTR" },
  { key: "CO", labelKey: "filterCO" },
  { key: "DE", labelKey: "filterDE" },
  { key: "CA", labelKey: "filterCA" },
];

function FilterSelect({
  filter,
  onChange,
  labels,
}: {
  filter: FilterKey;
  onChange: (key: FilterKey) => void;
  labels: PermitTrendSectionProps["labels"];
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">{labels.filterLabel}</span>
      <select
        value={filter}
        onChange={(e) => onChange(e.target.value as FilterKey)}
        className="border border-card-border rounded-lg px-3 py-1.5 bg-card-bg text-sm"
      >
        {FILTER_OPTIONS.map((opt) => (
          <option key={opt.key} value={opt.key}>
            {labels[opt.labelKey]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PermitTrendSection({ trends, labels, locale }: PermitTrendSectionProps) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const data = trends[filter] ?? [];
  const localeTag = locale === "fr" ? "fr-CA" : "en-CA";
  const filterName = labels[FILTER_OPTIONS.find((o) => o.key === filter)!.labelKey];

  // YoY chart data from filtered trends
  const yoyData =
    data.length >= 2
      ? data.slice(1).map((row, i) => {
          const prev = data[i].total;
          const pctChange = prev > 0 ? ((row.total - prev) / prev) * 100 : 0;
          return { year: row.year, pctChange: Math.round(pctChange * 10) / 10 };
        })
      : [];

  return (
    <div className="space-y-8">
      {/* Trend table */}
      <section className="border border-card-border rounded-xl p-6 bg-card-bg">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h2 className="text-xl font-bold">
            {labels.historicalTrend} — {filterName}
          </h2>
          <FilterSelect filter={filter} onChange={setFilter} labels={labels} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-left">
                <th className="py-2 pr-4">{labels.year}</th>
                <th className="py-2 pr-4">{labels.permitsFiled}</th>
                <th className="py-2">{labels.medianDays}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.year} className="border-b border-card-border">
                  <td className="py-2 pr-4 font-mono">{row.year}</td>
                  <td className="py-2 pr-4">{row.total.toLocaleString(localeTag)}</td>
                  <td className="py-2">
                    {row.medianDays > 0
                      ? `${Math.round(row.medianDays)} ${labels.days}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* YoY chart */}
      {yoyData.length > 0 && (
        <section className="border border-card-border rounded-xl p-6 bg-card-bg">
          <h2 className="text-xl font-bold mb-4">
            {labels.yoyTitle} — {filterName}
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={yoyData} margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
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
                {yoyData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.pctChange >= 0 ? "var(--grade-a)" : "var(--grade-f)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}
    </div>
  );
}
