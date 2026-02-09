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
import { gradeColor } from "@/lib/scoring";

interface PermitBarChartProps {
  data: {
    borough: string;
    medianDays: number;
    grade: Grade;
  }[];
  targetDays?: number;
  previousTargetDays?: number;
  labels: {
    yAxis: string;
    tooltipLabel: string;
    tooltipUnit: string;
    targetLabel: string;
    previousTargetLabel?: string;
  };
}

export function PermitBarChart({ data, targetDays = 90, previousTargetDays, labels }: PermitBarChartProps) {
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
          label={{ value: labels.yAxis, angle: -90, position: "insideLeft" }}
          tick={{ fontSize: 12 }}
        />
        <Tooltip
          formatter={(value: number) => [`${Math.round(value)} ${labels.tooltipUnit}`, labels.tooltipLabel]}
          contentStyle={{
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: "8px",
          }}
        />
        {previousTargetDays && labels.previousTargetLabel && (
          <ReferenceLine
            y={previousTargetDays}
            stroke="var(--muted)"
            strokeDasharray="5 5"
            label={{ value: labels.previousTargetLabel, position: "insideTopLeft", fontSize: 11 }}
          />
        )}
        <ReferenceLine
          y={targetDays}
          stroke="var(--grade-a)"
          strokeDasharray="5 5"
          label={{ value: labels.targetLabel, position: "insideTopLeft", fontSize: 12 }}
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
