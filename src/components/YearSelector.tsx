"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";

export interface YearPreset {
  label: string;
  year: number;
}

interface YearSelectorProps {
  selectedYear: number;
  minYear: number;
  maxYear: number;
  label: string;
  presets?: YearPreset[];
}

export function YearSelector({
  selectedYear,
  minYear,
  maxYear,
  label,
  presets,
}: YearSelectorProps) {
  const pathname = usePathname();
  const router = useRouter();

  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i);

  const navigate = useCallback(
    (year: number) => {
      router.replace(`${pathname}?year=${year}`);
    },
    [pathname, router]
  );

  const selectClass =
    "bg-card-bg border border-card-border rounded px-2 py-1 text-sm font-mono cursor-pointer hover:border-accent transition-colors";

  return (
    <div className="flex flex-col items-end gap-2">
      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const isActive = p.year === selectedYear;
            return (
              <button
                key={p.label}
                onClick={() => navigate(p.year)}
                className={`px-2 py-0.5 rounded text-xs transition-colors ${
                  isActive
                    ? "bg-accent text-white"
                    : "border border-card-border hover:border-accent"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}
      <label className="flex items-center gap-1.5 text-sm">
        <span className="text-muted">{label}</span>
        <select
          value={selectedYear}
          onChange={(e) => navigate(+e.target.value)}
          className={selectClass}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
