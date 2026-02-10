import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "VolunteerPage" });
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    openGraph: {
      url: `https://montrealscore.ashwater.ca/${locale}/volunteer`,
    },
    alternates: {
      canonical: `https://montrealscore.ashwater.ca/${locale}/volunteer`,
      languages: {
        fr: "https://montrealscore.ashwater.ca/fr/volunteer",
        en: "https://montrealscore.ashwater.ca/en/volunteer",
        "x-default": "https://montrealscore.ashwater.ca/fr/volunteer",
      },
    },
  };
}

export default async function VolunteerPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("VolunteerPage");

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Hero */}
      <h1 className="text-3xl font-bold mb-3">{t("title")}</h1>
      <p className="text-base text-muted mb-8 leading-relaxed">{t("heroSubtitle")}</p>

      {/* The Problem */}
      <section className="mb-10">
        <h2 className="text-xl font-bold mb-3">{t("problemTitle")}</h2>
        <p className="text-base leading-relaxed">{t("problemText")}</p>
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
