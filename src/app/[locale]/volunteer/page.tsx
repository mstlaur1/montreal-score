import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getNeedsHelpPromises, getPromiseSummary } from "@/lib/data";
import type { PromiseCategory } from "@/lib/types";

export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "VolunteerPage" });
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    alternates: {
      canonical: `https://montrealscore.ashwater.ca/${locale}/volunteer`,
      languages: { fr: "/fr/volunteer", en: "/en/volunteer" },
    },
  };
}

export default async function VolunteerPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("VolunteerPage");
  const tCat = await getTranslations("PromisesPage");

  const [needsHelpPromises, summary] = await Promise.all([
    getNeedsHelpPromises(),
    getPromiseSummary(),
  ]);

  // Group by category
  const byCategory = new Map<string, typeof needsHelpPromises>();
  for (const p of needsHelpPromises) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }
  const sortedCategories = [...byCategory.entries()].sort(([, a], [, b]) => b.length - a.length);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Hero */}
      <h1 className="text-3xl font-bold mb-3">{t("title")}</h1>
      <p className="text-base text-muted mb-8 leading-relaxed">{t("heroSubtitle")}</p>

      {/* The Problem */}
      <section className="mb-10">
        <h2 className="text-xl font-bold mb-3">{t("problemTitle")}</h2>
        <p className="text-base leading-relaxed">
          {t("problemText", { total: summary.total, count: needsHelpPromises.length })}
        </p>
      </section>

      {/* How You Can Help */}
      <section className="mb-10">
        <h2 className="text-xl font-bold mb-3">{t("howTitle")}</h2>
        <p className="text-base mb-4">{t("howIntro")}</p>
        <ul className="space-y-4 ml-1">
          <li>
            <strong>{t("howPermits")}</strong>
            <p className="text-sm text-muted mt-0.5">{t("howPermitsDetail")}</p>
          </li>
          <li>
            <strong>{t("howServices")}</strong>
            <p className="text-sm text-muted mt-0.5">{t("howServicesDetail")}</p>
          </li>
          <li>
            <strong>{t("howNeighbourhood")}</strong>
            <p className="text-sm text-muted mt-0.5">{t("howNeighbourhoodDetail")}</p>
          </li>
          <li>
            <strong>{t("howCouncil")}</strong>
            <p className="text-sm text-muted mt-0.5">{t("howCouncilDetail")}</p>
          </li>
        </ul>
      </section>

      {/* Browsable list of needs_help promises */}
      {needsHelpPromises.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-bold mb-2">{t("promisesTitle")}</h2>
          <p className="text-sm text-muted mb-6">{t("promisesSubtitle")}</p>

          <div className="space-y-4">
            {sortedCategories.map(([categoryName, promises]) => (
              <details key={categoryName} className="border border-card-border rounded-xl bg-card-bg">
                <summary className="px-6 py-4 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{tCat(`category.${categoryName}`)}</h3>
                    <span className="text-sm text-muted">{promises.length}</span>
                  </div>
                </summary>
                <div className="px-6 pb-6">
                  <ul className="space-y-2">
                    {promises.map((p, i) => (
                      <li key={p.id} className="border-b border-card-border pb-2 last:border-0 last:pb-0">
                        <div className="flex items-start gap-3">
                          <span className="text-sm font-mono text-muted mt-0.5 w-5 shrink-0">
                            {i + 1}.
                          </span>
                          <p className="text-sm">
                            {locale === "fr" ? p.text_fr : p.text_en}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="border border-purple-200 dark:border-purple-800 rounded-xl p-6 bg-purple-50 dark:bg-purple-950">
        <h2 className="text-xl font-bold mb-3">{t("ctaTitle")}</h2>
        <p className="text-base mb-3">
          {t.rich("ctaEmail", {
            email: (chunks) => (
              <a href="mailto:me@ashwater.ca" className="text-accent underline font-medium">
                {chunks}
              </a>
            ),
          })}
        </p>
        <p className="text-sm text-muted">{t("ctaNote")}</p>
      </section>
    </div>
  );
}
