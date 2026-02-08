"use client";

import { usePathname, useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("LocaleSwitcher");

  function switchLocale() {
    const next = locale === "fr" ? "en" : "fr";
    router.replace(pathname, { locale: next });
  }

  return (
    <button
      onClick={switchLocale}
      className="text-xs font-mono px-2 py-1 border border-card-border rounded hover:bg-card-bg transition-colors"
      aria-label={`Switch to ${locale === "fr" ? "English" : "French"}`}
    >
      {t("label")}
    </button>
  );
}
