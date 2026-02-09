"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";

interface DateRangeSelectorProps {
  fromYear: number;
  fromMonth: number;
  toYear: number;
  toMonth: number;
  minDate: string; // "YYYY-MM"
  maxDate: string; // "YYYY-MM"
  locale: string;
  labels: { from: string; to: string };
}

function getMonthNames(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    month: "short",
  });
  return Array.from({ length: 12 }, (_, i) =>
    fmt.format(new Date(2024, i, 1))
  );
}

function parseYearMonth(ym: string): [number, number] {
  const [y, m] = ym.split("-").map(Number);
  return [y, m];
}

export function DateRangeSelector({
  fromYear,
  fromMonth,
  toYear,
  toMonth,
  minDate,
  maxDate,
  locale,
  labels,
}: DateRangeSelectorProps) {
  const pathname = usePathname();
  const router = useRouter();
  const months = getMonthNames(locale);

  const [minY, minM] = parseYearMonth(minDate);
  const [maxY, maxM] = parseYearMonth(maxDate);

  const years = Array.from({ length: maxY - minY + 1 }, (_, i) => minY + i);

  const navigate = useCallback(
    (fY: number, fM: number, tY: number, tM: number) => {
      // Clamp: if from > to, set to = from
      if (fY > tY || (fY === tY && fM > tM)) {
        tY = fY;
        tM = fM;
      }
      const from = `${fY}-${String(fM).padStart(2, "0")}`;
      const to = `${tY}-${String(tM).padStart(2, "0")}`;
      router.replace(`${pathname}?from=${from}&to=${to}`);
    },
    [pathname, router]
  );

  const selectClass =
    "bg-card-bg border border-card-border rounded px-1.5 py-1 text-sm font-mono cursor-pointer hover:border-accent transition-colors";

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-1.5">
        <span className="text-muted">{labels.from}</span>
        <select
          value={fromMonth}
          onChange={(e) => navigate(fromYear, +e.target.value, toYear, toMonth)}
          className={selectClass}
        >
          {months.map((name, i) => (
            <option key={i} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={fromYear}
          onChange={(e) => navigate(+e.target.value, fromMonth, toYear, toMonth)}
          className={selectClass}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <span className="text-muted">–</span>
      <label className="flex items-center gap-1.5">
        <span className="text-muted">{labels.to}</span>
        <select
          value={toMonth}
          onChange={(e) => navigate(fromYear, fromMonth, toYear, +e.target.value)}
          className={selectClass}
        >
          {months.map((name, i) => (
            <option key={i} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={toYear}
          onChange={(e) => navigate(fromYear, fromMonth, +e.target.value, toMonth)}
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
