"use client";

import { useTranslations } from "next-intl";

export default function Error({ reset }: { reset: () => void }) {
  const t = useTranslations("ErrorPage");
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold mb-4">{t("title")}</h1>
      <p className="text-muted mb-6">{t("description")}</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-accent text-white rounded-lg hover:opacity-90 transition-opacity"
      >
        {t("retry")}
      </button>
    </div>
  );
}
