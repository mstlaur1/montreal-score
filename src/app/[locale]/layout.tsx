import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("siteTitle"),
    description: t("siteDescription"),
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const t = await getTranslations("Nav");
  const tFooter = await getTranslations("Footer");

  return (
    <html lang={locale}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NextIntlClientProvider>
          <header className="border-b border-card-border">
            <nav className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
              <Link href="/" className="text-xl font-bold tracking-tight">
                Montréal<span className="text-accent">Score</span>
              </Link>
              <div className="flex items-center gap-6 text-sm">
                <Link href="/permits" className="hover:text-accent transition-colors">
                  {t("permits")}
                </Link>
                <Link href="/boroughs" className="hover:text-accent transition-colors">
                  {t("boroughs")}
                </Link>
                <Link href="/311" className="hover:text-accent transition-colors">
                  {t("311")}
                </Link>
                <Link href="/about" className="hover:text-accent transition-colors">
                  {t("about")}
                </Link>
                <LocaleSwitcher />
              </div>
            </nav>
          </header>
          <main>{children}</main>
          <footer className="border-t border-card-border mt-16">
            <div className="max-w-6xl mx-auto px-4 py-8 text-sm text-muted">
              <p>
                {tFooter("dataFrom")}{" "}
                <a
                  href="https://donnees.montreal.ca"
                  className="underline hover:text-accent"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  donnees.montreal.ca
                </a>
                . {tFooter("openSourceBy")}{" "}
                <a href="https://brule.ai" className="underline hover:text-accent">
                  Brulé AI
                </a>
                .
              </p>
            </div>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
