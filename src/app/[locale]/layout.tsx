import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { getLatestEtlRun } from "@/lib/db";
import { getJurisdiction } from "@/lib/jurisdiction";
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
  const jx = getJurisdiction();
  const baseUrl = `https://${jx.domain}`;
  return {
    metadataBase: new URL(baseUrl),
    title: t("siteTitle"),
    description: t("siteDescription"),
    openGraph: {
      url: `${baseUrl}/${locale}`,
      siteName: jx.brandName,
      locale: locale === "fr" ? "fr_CA" : "en_CA",
      type: "website",
      images: [
        {
          url: `${baseUrl}/og-image.png`,
          width: 1200,
          height: 630,
          alt: jx.brandName,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      images: [`${baseUrl}/og-image.png`],
    },
    alternates: {
      canonical: `${baseUrl}/${locale}`,
      languages: {
        fr: `${baseUrl}/fr`,
        en: `${baseUrl}/en`,
        "x-default": `${baseUrl}/fr`,
      },
    },
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
  const tMeta = await getTranslations("Metadata");
  const jx = getJurisdiction();

  return (
    <html lang={locale}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: jx.brandName,
              url: `https://${jx.domain}`,
              description: tMeta("siteDescription"),
              inLanguage: [locale === "fr" ? "fr-CA" : "en-CA"],
              publisher: {
                "@type": "Organization",
                name: "Ashwater",
                url: "https://ashwater.ca",
              },
            }).replace(/</g, "\\u003c"),
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NextIntlClientProvider>
          <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:rounded-lg">
            {locale === "fr" ? "Aller au contenu" : "Skip to content"}
          </a>
          <header className="border-b border-card-border">
            <nav aria-label={locale === "fr" ? "Navigation principale" : "Main navigation"} className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link href="/" className="text-xl font-bold tracking-tight mr-auto">
                {jx.brandPrefix}<span className="text-accent">{jx.brandAccent}</span>
              </Link>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm md:gap-x-6">
                <Link href="/promises" className="hover:text-accent transition-colors">
                  {t("promises")}
                </Link>
                <Link href="/permits" className="hover:text-accent transition-colors">
                  {t("permits")}
                </Link>
                <Link href="/contracts" className="hover:text-accent transition-colors">
                  {t("contracts")}
                </Link>
                <Link href="/311" className="hover:text-accent transition-colors">
                  {t("311")}
                </Link>
                {/* Boroughs page — disabled for now
                <Link href="/boroughs" className="hover:text-accent transition-colors">
                  {t("boroughs")}
                </Link>
                */}
                <Link href="/about" className="hover:text-accent transition-colors">
                  {t("about")}
                </Link>
                <Link href="/volunteer" className="hover:text-accent transition-colors">
                  {t("volunteer")}
                </Link>
                <LocaleSwitcher />
              </div>
            </nav>
          </header>
          <main id="main-content">{children}</main>
          <footer className="border-t border-card-border mt-16">
            <div className="max-w-6xl mx-auto px-4 py-8 text-sm text-muted space-y-2">
              <p>
                {tFooter("dataFrom")}{" "}
                <a
                  href={jx.dataSource.url}
                  className="underline hover:text-accent"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {jx.dataSource.name}
                </a>
                . {tFooter("openSourceBy")}{" "}
                <a href="https://ashwater.ca" className="underline hover:text-accent">
                  Ashwater
                </a>
                .
              </p>
              {(() => {
                const lastRun = getLatestEtlRun();
                if (!lastRun) return null;
                const d = new Date(lastRun);
                const formatted = d.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", {
                  year: "numeric", month: "long", day: "numeric",
                });
                return <p>{tFooter("lastUpdated", { date: formatted })}</p>;
              })()}
              <p>{tFooter("disclaimer")}</p>
            </div>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
