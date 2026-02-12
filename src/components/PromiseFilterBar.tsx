"use client";

import { useState, useMemo } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { CampaignPromise, PromiseStatus, PromiseSentiment } from "@/lib/types";

interface PromiseFilterBarProps {
  promises: CampaignPromise[];
  locale: string;
  labels: {
    searchPlaceholder: string;
    allStatuses: string;
    allCategories: string;
    matchCount: string;
    matchCountOne: string;
    noMatches: string;
    latestUpdate: string;
    source: string;
    target: string;
    statusLabels: Record<string, string>;
    categoryLabels: Record<string, string>;
  };
  children: React.ReactNode;
}

const STATUSES: PromiseStatus[] = ["not_started", "in_progress", "completed", "broken", "partially_met"];

function sentimentIcon(s: PromiseSentiment | null) {
  switch (s) {
    case "positive": return { icon: "+", cls: "text-green-600 dark:text-green-400" };
    case "negative": return { icon: "-", cls: "text-red-600 dark:text-red-400" };
    case "mixed": return { icon: "~", cls: "text-yellow-600 dark:text-yellow-400" };
    default: return { icon: "?", cls: "text-muted" };
  }
}

export function PromiseFilterBar({ promises, locale, labels, children }: PromiseFilterBarProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  const isFiltering = searchTerm.trim() !== "" || filterStatus !== "" || filterCategory !== "";

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const p of promises) cats.add(p.category);
    return [...cats].sort();
  }, [promises]);

  const filtered = useMemo(() => {
    if (!isFiltering) return [];
    const term = searchTerm.toLowerCase().trim();
    return promises.filter((p) => {
      if (filterStatus && p.status !== filterStatus) return false;
      if (filterCategory && p.category !== filterCategory) return false;
      if (term) {
        const haystack = [p.text_en, p.text_fr, p.id, p.category, p.borough ?? ""].join(" ").toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [promises, searchTerm, filterStatus, filterCategory, isFiltering]);

  return (
    <div>
      {/* Filter controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={labels.searchPlaceholder}
          className="flex-1 px-3 py-2 rounded-lg border border-card-border bg-card-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-lg border border-card-border bg-card-bg text-sm"
        >
          <option value="">{labels.allStatuses}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{labels.statusLabels[s]}</option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 rounded-lg border border-card-border bg-card-bg text-sm"
        >
          <option value="">{labels.allCategories}</option>
          {categories.map((c) => (
            <option key={c} value={c}>{labels.categoryLabels[c] ?? c}</option>
          ))}
        </select>
      </div>

      {isFiltering ? (
        <div>
          <p className="text-sm text-muted mb-4">
            {filtered.length > 0
              ? `${filtered.length} ${filtered.length === 1 ? labels.matchCountOne : labels.matchCount}`
              : labels.noMatches}
          </p>
          {filtered.length > 0 && (
            <ul className="space-y-4 mb-10">
              {filtered.map((p, i) => {
                const update = p.latestUpdate;
                const sentiment = update ? sentimentIcon(update.sentiment) : null;
                return (
                  <li key={p.id} className="border-b border-card-border pb-4 last:border-0 last:pb-0">
                    <div className="flex items-start gap-3">
                      <span className="text-sm font-mono text-muted mt-0.5 w-6 shrink-0">
                        {i + 1}.
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          {locale === "fr" ? p.text_fr : p.text_en}
                        </p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted">
                          <span>{labels.categoryLabels[p.category] ?? p.category}</span>
                          {p.borough && <span>· {p.borough}</span>}
                        </div>
                        {p.target_value && (
                          <span className="text-xs text-muted block mt-0.5">
                            {labels.target}: {p.target_value}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {sentiment && (
                          <span className={`text-sm font-bold ${sentiment.cls}`} title={update?.sentiment ?? ""}>
                            {sentiment.icon}
                          </span>
                        )}
                        <StatusBadge status={p.status} label={labels.statusLabels[p.status]} />
                      </div>
                    </div>
                    {update && (
                      <details className="ml-9 mt-1">
                        <summary className="text-xs text-accent cursor-pointer hover:underline">
                          {labels.latestUpdate} — {update.date}
                        </summary>
                        <div className="mt-1">
                          <p className="text-xs text-muted">
                            {locale === "fr" ? update.summary_fr : update.summary_en}
                          </p>
                          {update.source_url && (
                            <a
                              href={update.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-accent hover:underline mt-1 inline-block"
                            >
                              {update.source_title ?? labels.source} &rarr;
                            </a>
                          )}
                        </div>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
