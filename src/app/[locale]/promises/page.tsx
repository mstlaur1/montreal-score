import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFirst100DaysPromises, getPromiseSummary, getPromisesByBorough, getPlatformPromisesByCategory } from "@/lib/data";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import type { PromiseStatus, PromiseSentiment, CampaignPromise } from "@/lib/types";

export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "PromisesPage" });
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    alternates: {
      canonical: `https://montrealscore.ashwater.ca/${locale}/promises`,
      languages: { fr: "/fr/promises", en: "/en/promises" },
    },
  };
}

// Inauguration: Nov 10, 2025. 100-day deadline: Feb 18, 2026.
const INAUGURATION = new Date("2025-11-10");
const DEADLINE_100 = new Date("2026-02-18");

function get100DayProgress() {
  const now = new Date();
  const totalMs = DEADLINE_100.getTime() - INAUGURATION.getTime();
  const elapsedMs = now.getTime() - INAUGURATION.getTime();
  const dayElapsed = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
  const pct = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
  return { dayElapsed: Math.max(0, dayElapsed), pct, expired: now > DEADLINE_100 };
}

/** Compute status breakdown percentages from a list of promises */
function statusBreakdown(promises: CampaignPromise[]) {
  const total = promises.length;
  if (total === 0) return { completed: 0, in_progress: 0, broken: 0, partially_met: 0, not_started: 0, completedN: 0, inProgressN: 0, brokenN: 0, partialN: 0, notStartedN: 0, total: 0 };
  const completedN = promises.filter((p) => p.status === "completed").length;
  const inProgressN = promises.filter((p) => p.status === "in_progress").length;
  const brokenN = promises.filter((p) => p.status === "broken").length;
  const partialN = promises.filter((p) => p.status === "partially_met").length;
  const notStartedN = total - completedN - inProgressN - brokenN - partialN;
  return {
    completed: (completedN / total) * 100,
    in_progress: (inProgressN / total) * 100,
    broken: (brokenN / total) * 100,
    partially_met: (partialN / total) * 100,
    not_started: (notStartedN / total) * 100,
    completedN, inProgressN, brokenN, partialN, notStartedN, total,
  };
}

/** Group a borough's promises by subcategory (borough-level vs district) */
function groupBySubcategory(promises: CampaignPromise[]) {
  const groups = new Map<string, CampaignPromise[]>();
  for (const p of promises) {
    const key = p.subcategory ?? "borough";
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }
  return groups;
}

export default async function PromisesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("PromisesPage");

  const [first100, summary, boroughMap, platformMap] = await Promise.all([
    getFirst100DaysPromises(),
    getPromiseSummary(),
    getPromisesByBorough(),
    getPlatformPromisesByCategory(),
  ]);

  const { dayElapsed, pct, expired } = get100DayProgress();
  const completedCount = first100.filter((p) => p.status === "completed").length;

  // All promises: flatten borough map + first100 + platform for full count
  const allPromises = [...first100];
  for (const promises of boroughMap.values()) allPromises.push(...promises);
  for (const promises of platformMap.values()) allPromises.push(...promises);

  // Sort platform categories by promise count (descending)
  const sortedCategories = [...platformMap.entries()].sort(([, a], [, b]) => b.length - a.length);
  const allStats = statusBreakdown(allPromises);
  const first100Stats = statusBreakdown(first100);

  const statusLabel = (s: PromiseStatus) => t(`status.${s}`);

  const sentimentIcon = (s: PromiseSentiment | null) => {
    switch (s) {
      case "positive": return { icon: "+", cls: "text-green-600 dark:text-green-400" };
      case "negative": return { icon: "-", cls: "text-red-600 dark:text-red-400" };
      case "mixed": return { icon: "~", cls: "text-yellow-600 dark:text-yellow-400" };
      default: return { icon: "?", cls: "text-muted" };
    }
  };

  // Sort boroughs alphabetically
  const sortedBoroughs = [...boroughMap.entries()].sort(([a], [b]) => a.localeCompare(b, "fr"));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
      <p className="text-muted mb-6">{t("subtitle")}</p>

      {/* All Promises Progress Bar */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-2">{t("progressBar.allPromises")}</h2>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-5 flex overflow-hidden">
          {allStats.completed > 0 && (
            <div className="bg-green-700 h-5 transition-all" style={{ width: `${allStats.completed}%` }} />
          )}
          {allStats.in_progress > 0 && (
            <div className="bg-yellow-400 h-5 transition-all" style={{ width: `${allStats.in_progress}%` }} />
          )}
          {allStats.broken > 0 && (
            <div className="bg-red-500 h-5 transition-all" style={{ width: `${allStats.broken}%` }} />
          )}
          {allStats.partially_met > 0 && (
            <div className="bg-emerald-400 h-5 transition-all" style={{ width: `${allStats.partially_met}%` }} />
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-700" />
            {t("progressBar.completed")}: {allStats.completedN} {t("progressBar.of")} {allStats.total}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-yellow-400" />
            {t("progressBar.inProgress")}: {allStats.inProgressN}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-400" />
            {t("progressBar.partial")}: {allStats.partialN}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500" />
            {t("progressBar.broken")}: {allStats.brokenN}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-gray-300 dark:bg-gray-600" />
            {t("progressBar.notStarted")}: {allStats.notStartedN}
          </span>
        </div>
        {/* Sentiment legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted">
          <span>{t("sentiment.label")}:</span>
          <span className="flex items-center gap-1">
            <span className="text-green-600 dark:text-green-400 font-bold">+</span> {t("sentiment.positive")}
          </span>
          <span className="flex items-center gap-1">
            <span className="text-yellow-600 dark:text-yellow-400 font-bold">~</span> {t("sentiment.mixed")}
          </span>
          <span className="flex items-center gap-1">
            <span className="text-red-600 dark:text-red-400 font-bold">-</span> {t("sentiment.negative")}
          </span>
          <span className="flex items-center gap-1">
            <span className="text-muted font-bold">?</span> {t("sentiment.unknown")}
          </span>
        </div>
      </section>

      {/* First 100 Days */}
      <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-10">
        <h2 className="text-xl font-bold mb-1">{t("first100.title")}</h2>
        <p className="text-sm text-muted mb-4">
          {expired
            ? t("first100.expired")
            : t("first100.dayCount", { day: dayElapsed })}
        </p>

        {/* Status progress bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 flex overflow-hidden mb-1">
          {first100Stats.completed > 0 && (
            <div className="bg-green-700 h-4 transition-all" style={{ width: `${first100Stats.completed}%` }} />
          )}
          {first100Stats.in_progress > 0 && (
            <div className="bg-yellow-400 h-4 transition-all" style={{ width: `${first100Stats.in_progress}%` }} />
          )}
          {first100Stats.broken > 0 && (
            <div className="bg-red-500 h-4 transition-all" style={{ width: `${first100Stats.broken}%` }} />
          )}
          {first100Stats.partially_met > 0 && (
            <div className="bg-emerald-400 h-4 transition-all" style={{ width: `${first100Stats.partially_met}%` }} />
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted mb-6">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-green-700" />
            {t("progressBar.completed")}: {first100Stats.completedN}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-yellow-400" />
            {t("progressBar.inProgress")}: {first100Stats.inProgressN}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-emerald-400" />
            {t("progressBar.partial")}: {first100Stats.partialN}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-red-500" />
            {t("progressBar.broken")}: {first100Stats.brokenN}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-gray-300 dark:bg-gray-600" />
            {t("progressBar.notStarted")}: {first100Stats.notStartedN}
          </span>
        </div>

        {/* Promise list */}
        <ul className="space-y-4">
          {first100.map((p, i) => {
            const update = p.latestUpdate;
            const sentiment = update ? sentimentIcon(update.sentiment) : null;
            return (
              <li key={p.id} className="border-b border-card-border pb-4 last:border-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <span className="text-sm font-mono text-muted mt-0.5 w-5 shrink-0">
                    {i + 1}.
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      {locale === "fr" ? p.text_fr : p.text_en}
                    </p>
                    {p.target_value && (
                      <span className="text-xs text-muted">
                        {t("target")}: {p.target_value}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {sentiment && (
                      <span className={`text-sm font-bold ${sentiment.cls}`} title={update?.sentiment ?? ""}>
                        {sentiment.icon}
                      </span>
                    )}
                    <StatusBadge status={p.status} label={statusLabel(p.status)} />
                  </div>
                </div>
                {update && (
                  <details className="ml-8 mt-1">
                    <summary className="text-xs text-accent cursor-pointer hover:underline">
                      {t("latestUpdate")} — {update.date}
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
                          {update.source_title ?? t("source")} &rarr;
                        </a>
                      )}
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Summary Stats */}
      <section className="mb-10">
        <h2 className="text-xl font-bold mb-4">{t("summaryTitle")}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label={t("stat.total")} value={summary.total} />
          <StatCard label={t("stat.notStarted")} value={summary.not_started} />
          <StatCard label={t("stat.inProgress")} value={summary.in_progress} />
          <StatCard label={t("stat.completed")} value={summary.completed} />
        </div>
      </section>

      {/* City-wide Platform Commitments */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold mb-2">{t("platformCommitmentsTitle")}</h2>
        <p className="text-sm text-muted mb-6">{t("platformCommitmentsSubtitle")}</p>

        <div className="space-y-6">
          {sortedCategories.map(([categoryName, promises]) => {
            const cs = statusBreakdown(promises);
            return (
              <details key={categoryName} className="border border-card-border rounded-xl bg-card-bg">
                <summary className="px-6 py-4 cursor-pointer">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold">{t(`category.${categoryName}`)}</h3>
                    <span className="text-sm text-muted">
                      {t("commitments", { count: promises.length })}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 flex overflow-hidden">
                    {cs.completed > 0 && (
                      <div className="bg-green-700 h-3 transition-all" style={{ width: `${cs.completed}%` }} />
                    )}
                    {cs.in_progress > 0 && (
                      <div className="bg-yellow-400 h-3 transition-all" style={{ width: `${cs.in_progress}%` }} />
                    )}
                    {cs.broken > 0 && (
                      <div className="bg-red-500 h-3 transition-all" style={{ width: `${cs.broken}%` }} />
                    )}
                    {cs.partially_met > 0 && (
                      <div className="bg-emerald-400 h-3 transition-all" style={{ width: `${cs.partially_met}%` }} />
                    )}
                  </div>
                </summary>
                <div className="px-6 pb-6">
                  <ul className="space-y-2">
                    {promises.map((p, i) => {
                      const update = p.latestUpdate;
                      const sentiment = update ? sentimentIcon(update.sentiment) : null;
                      return (
                        <li key={p.id} className="border-b border-card-border pb-2 last:border-0 last:pb-0">
                          <div className="flex items-start gap-3">
                            <span className="text-sm font-mono text-muted mt-0.5 w-5 shrink-0">
                              {i + 1}.
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm">
                                {locale === "fr" ? p.text_fr : p.text_en}
                              </p>
                              {p.target_value && (
                                <span className="text-xs text-muted">
                                  {t("target")}: {p.target_value}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {sentiment && (
                                <span className={`text-sm font-bold ${sentiment.cls}`} title={update?.sentiment ?? ""}>
                                  {sentiment.icon}
                                </span>
                              )}
                              <StatusBadge status={p.status} label={statusLabel(p.status)} />
                            </div>
                          </div>
                          {update && (
                            <details className="ml-8 mt-1">
                              <summary className="text-xs text-accent cursor-pointer hover:underline">
                                {t("latestUpdate")} — {update.date}
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
                                    {update.source_title ?? t("source")} &rarr;
                                  </a>
                                )}
                              </div>
                            </details>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </details>
            );
          })}
        </div>
      </section>

      {/* Borough Commitments */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold mb-2">{t("boroughCommitmentsTitle")}</h2>
        <p className="text-sm text-muted mb-6">{t("boroughCommitmentsSubtitle")}</p>

        <div className="space-y-6">
          {sortedBoroughs.map(([boroughName, promises]) => {
            const subcategories = groupBySubcategory(promises);
            const bs = statusBreakdown(promises);
            return (
              <details key={boroughName} className="border border-card-border rounded-xl bg-card-bg">
                <summary className="px-6 py-4 cursor-pointer">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold">{boroughName}</h3>
                    <span className="text-sm text-muted">
                      {t("commitments", { count: promises.length })}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 flex overflow-hidden">
                    {bs.completed > 0 && (
                      <div className="bg-green-700 h-3 transition-all" style={{ width: `${bs.completed}%` }} />
                    )}
                    {bs.in_progress > 0 && (
                      <div className="bg-yellow-400 h-3 transition-all" style={{ width: `${bs.in_progress}%` }} />
                    )}
                    {bs.broken > 0 && (
                      <div className="bg-red-500 h-3 transition-all" style={{ width: `${bs.broken}%` }} />
                    )}
                    {bs.partially_met > 0 && (
                      <div className="bg-emerald-400 h-3 transition-all" style={{ width: `${bs.partially_met}%` }} />
                    )}
                  </div>
                </summary>
                <div className="px-6 pb-6 space-y-4">
                  {[...subcategories.entries()].map(([subcategory, items]) => (
                    <div key={subcategory}>
                      <h4 className="text-sm font-semibold text-muted mb-2">
                        {subcategory === "borough" ? t("boroughLevel") : `${t("district")}: ${subcategory}`}
                      </h4>
                      <ul className="space-y-2">
                        {items.map((p, i) => {
                          const update = p.latestUpdate;
                          const sentiment = update ? sentimentIcon(update.sentiment) : null;
                          return (
                          <li key={p.id} className="border-b border-card-border pb-2 last:border-0 last:pb-0">
                            <div className="flex items-start gap-3">
                              <span className="text-sm font-mono text-muted mt-0.5 w-5 shrink-0">
                                {i + 1}.
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm">
                                  {locale === "fr" ? p.text_fr : p.text_en}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {sentiment && (
                                  <span className={`text-sm font-bold ${sentiment.cls}`} title={update?.sentiment ?? ""}>
                                    {sentiment.icon}
                                  </span>
                                )}
                                <StatusBadge status={p.status} label={statusLabel(p.status)} />
                              </div>
                            </div>
                            {update && (
                              <details className="ml-8 mt-1">
                                <summary className="text-xs text-accent cursor-pointer hover:underline">
                                  {t("latestUpdate")} — {update.date}
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
                                      {update.source_title ?? t("source")} &rarr;
                                    </a>
                                  )}
                                </div>
                              </details>
                            )}
                          </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      {/* Methodology */}
      <section className="text-sm text-muted space-y-2">
        <h2 className="text-lg font-bold text-foreground">{t("methodologyTitle")}</h2>
        <p>{t("methodologyText")}</p>
      </section>
    </div>
  );
}
