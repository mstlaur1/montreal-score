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
import type { Grade } from "@/lib/types";
import { gradeColor, scoreToGrade } from "@/lib/scoring";

interface PermitBarChartProps {
  data: {
    borough: string;
    medianDays: number;
    grade: Grade;
  }[];
  targetDays?: number;
}

export function PermitBarChart({ data, targetDays = 90 }: PermitBarChartProps) {
  // Shorten borough names for chart readability
  const chartData = data.map((d) => ({
    ...d,
    shortName: d.borough
      .replace("Mercier-Hochelaga-Maisonneuve", "MHM")
      .replace("Côte-des-Neiges-Notre-Dame-de-Grâce", "CDN-NDG")
      .replace("Villeray-Saint-Michel-Parc-Extension", "VSMPE")
      .replace("Rivière-des-Prairies-Pointe-aux-Trembles", "RDP-PAT")
      .replace("L'Île-Bizard-Sainte-Geneviève", "IB-SG")
      .replace("Rosemont-La Petite-Patrie", "Rosemont-PP")
      .replace("Pierrefonds-Roxboro", "Pierrefonds")
      .replace("Ahuntsic-Cartierville", "Ahuntsic")
      .replace("Le Plateau-Mont-Royal", "Plateau")
      .replace("Le Sud-Ouest", "Sud-Ouest"),
  }));

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={chartData} margin={{ top: 20, right: 20, bottom: 60, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
        <XAxis
          dataKey="shortName"
          angle={-45}
          textAnchor="end"
          height={80}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          label={{ value: "Jours", angle: -90, position: "insideLeft" }}
          tick={{ fontSize: 12 }}
        />
        <Tooltip
          formatter={(value: number) => [`${Math.round(value)} jours`, "Délai médian"]}
          contentStyle={{
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: "8px",
          }}
        />
        <ReferenceLine
          y={targetDays}
          stroke="var(--grade-a)"
          strokeDasharray="5 5"
          label={{ value: `Cible: ${targetDays}j`, position: "right", fontSize: 12 }}
        />
        <Bar dataKey="medianDays" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={index} fill={gradeColor(entry.grade)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
