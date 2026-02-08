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
            <strong>{t("data311")}</strong> — {t("data311Detail")}
          </li>
          <li>
            <strong>{t("dataSnow")}</strong> — {t("dataSnowDetail")}
          </li>
          <li>
            <strong>{t("dataRoads")}</strong> — {t("dataRoadsDetail")}
          </li>
          <li>
            <strong>{t("dataContracts")}</strong> — {t("dataContractsDetail")}
          </li>
        </ul>

        <h2 className="text-xl font-bold mt-8 mb-3">{t("methodologyTitle")}</h2>
        <p>{t("methodologyIntro")}</p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>{t("methodologyMedian")}</li>
          <li>{t("methodologyPct")}</li>
          <li>{t("methodologyTrend")}</li>
        </ul>
        <p className="mt-2">{t("methodologyNote")}</p>

        <h2 className="text-xl font-bold mt-8 mb-3">{t("openSourceTitle")}</h2>
        <p>
          {t.rich("openSourceBody", {
            link: (chunks) => (
              <a
                href="https://github.com/mstlaur1/montreal-score"
                className="text-accent underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {chunks}
              </a>
            ),
          })}
        </p>

        <h2 className="text-xl font-bold mt-8 mb-3">{t("contactTitle")}</h2>
        <p>
          {t.rich("contactBody", {
            link: (chunks) => (
              <a href="https://brule.ai" className="text-accent underline">
                {chunks}
              </a>
            ),
          })}
        </p>
      </section>
    </div>
  );
}
