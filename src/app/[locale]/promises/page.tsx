import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFirst100DaysPromises, getPromiseSummary } from "@/lib/data";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import type { PromiseStatus } from "@/lib/types";

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

export default async function PromisesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("PromisesPage");

  const [first100, summary] = await Promise.all([
    getFirst100DaysPromises(),
    getPromiseSummary(),
  ]);

  const { dayElapsed, pct, expired } = get100DayProgress();
  const completedCount = first100.filter((p) => p.status === "completed").length;

  const statusLabel = (s: PromiseStatus) => t(`status.${s}`);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
      <p className="text-muted mb-8">{t("subtitle")}</p>

      {/* First 100 Days */}
      <section className="border border-card-border rounded-xl p-6 bg-card-bg mb-10">
        <h2 className="text-xl font-bold mb-1">{t("first100.title")}</h2>
        <p className="text-sm text-muted mb-4">
          {expired
            ? t("first100.expired")
            : t("first100.dayCount", { day: dayElapsed })}
        </p>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-1">
          <div
            className={`h-3 rounded-full transition-all ${expired ? "bg-red-500" : "bg-accent"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted mb-6">
          {t("first100.completed", { done: completedCount, total: first100.length })}
        </p>

        {/* Promise list */}
        <ul className="space-y-3">
          {first100.map((p, i) => (
            <li key={p.id} className="flex items-start gap-3">
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
              <StatusBadge status={p.status} label={statusLabel(p.status)} />
            </li>
          ))}
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

      {/* Methodology */}
      <section className="text-sm text-muted space-y-2">
        <h2 className="text-lg font-bold text-foreground">{t("methodologyTitle")}</h2>
        <p>{t("methodologyText")}</p>
      </section>
    </div>
  );
}
