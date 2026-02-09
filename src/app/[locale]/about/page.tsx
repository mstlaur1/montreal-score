import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "AboutPage" });
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    alternates: {
      canonical: `https://montrealscore.ashwater.ca/${locale}/about`,
      languages: { fr: "/fr/about", en: "/en/about" },
    },
  };
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("AboutPage");

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">{t("title")}</h1>

      <section className="space-y-4 text-base leading-relaxed">
        <p>{t("intro")}</p>
        <p>{t("intro2")}</p>

        <h2 className="text-xl font-bold mt-8 mb-3">{t("whatTitle")}</h2>
        <ul className="space-y-3 ml-1">
          <li>
            <strong>{t("whatPromises")}</strong> — {t("whatPromisesDetail")}
          </li>
          <li>
            <strong>{t("whatPermits")}</strong> — {t("whatPermitsDetail")}
          </li>
          <li>
            <strong>{t("whatContracts")}</strong> — {t("whatContractsDetail")}
          </li>
        </ul>

        <h2 className="text-xl font-bold mt-8 mb-3">{t("whyTitle")}</h2>
        <p>{t("whyBody")}</p>
        <p>{t("whyBody2")}</p>

        <h2 className="text-xl font-bold mt-8 mb-3">{t("dataSourcesTitle")}</h2>
        <p>
          {t.rich("dataSourcesIntro", {
            link: (chunks) => (
              <a
                href="https://donnees.montreal.ca"
                className="text-accent underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>
            <strong>{t("dataPermits")}</strong> — {t("dataPermitsDetail")}
          </li>
          <li>
            <strong>{t("dataContracts")}</strong> — {t("dataContractsDetail")}
          </li>
          <li>
            <strong>{t("dataPromises")}</strong> — {t("dataPromisesDetail")}
          </li>
        </ul>

        <h2 className="text-xl font-bold mt-8 mb-3">{t("methodologyTitle")}</h2>
        <p>{t("methodologyIntro")}</p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>{t("methodologyMedian")}</li>
          <li>{t("methodologyPct")}</li>
          <li>{t("methodologyTrend")}</li>
        </ul>
        <p className="mt-2">{t("methodologyPromises")}</p>

        <h2 className="text-xl font-bold mt-8 mb-3">{t("contributeTitle")}</h2>
        <p>{t("contributeBody")}</p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>{t("contributeTip")}</li>
          <li>{t("contributeSource")}</li>
          <li>{t("contributeCorrection")}</li>
        </ul>
        <p className="mt-2">
          {t.rich("contributeHow", {
            email: (chunks) => (
              <a href="mailto:me@ashwater.ca" className="text-accent underline">
                {chunks}
              </a>
            ),
          })}
        </p>

        <h2 id="contact" className="text-xl font-bold mt-8 mb-3">{t("contactTitle")}</h2>
        <p>
          {t.rich("contactBody", {
            ashwater: (chunks) => (
              <a href="https://ashwater.ca" className="text-accent underline" target="_blank" rel="noopener noreferrer">
                {chunks}
              </a>
            ),
            email: (chunks) => (
              <a href="mailto:me@ashwater.ca" className="text-accent underline">
                {chunks}
              </a>
            ),
          })}
        </p>
      </section>
    </div>
  );
}
