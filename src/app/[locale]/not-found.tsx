import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("NotFoundPage");
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <h1 className="text-4xl font-bold mb-4">{t("title")}</h1>
      <p className="text-muted mb-6">{t("description")}</p>
      <Link
        href="/"
        className="px-4 py-2 bg-accent text-white rounded-lg hover:opacity-90 transition-opacity inline-block"
      >
        {t("goHome")}
      </Link>
    </div>
  );
}
