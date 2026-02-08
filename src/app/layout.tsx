import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MontréalScore — Government Accountability Tracker",
  description:
    "Borough-by-borough performance grades for Montreal, powered by the city's own open data. Permits, 311 requests, snow removal, and more.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <header className="border-b border-card-border">
          <nav className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <a href="/" className="text-xl font-bold tracking-tight">
              Montréal<span className="text-accent">Score</span>
            </a>
            <div className="flex gap-6 text-sm">
              <a href="/permits" className="hover:text-accent transition-colors">
                Permis
              </a>
              <a href="/boroughs" className="hover:text-accent transition-colors">
                Arrondissements
              </a>
              <a href="/311" className="hover:text-accent transition-colors">
                311
              </a>
              <a href="/about" className="hover:text-accent transition-colors">
                À propos
              </a>
            </div>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="border-t border-card-border mt-16">
          <div className="max-w-6xl mx-auto px-4 py-8 text-sm text-muted">
            <p>
              Données provenant de{" "}
              <a
                href="https://donnees.montreal.ca"
                className="underline hover:text-accent"
                target="_blank"
                rel="noopener noreferrer"
              >
                donnees.montreal.ca
              </a>
              . Projet open-source par{" "}
              <a href="https://brule.ai" className="underline hover:text-accent">
                Brulé AI
              </a>
              .
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
