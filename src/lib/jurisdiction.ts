/**
 * Jurisdiction configuration system.
 *
 * Centralizes all jurisdiction-specific constants so adding a new
 * government level (Quebec, Canada) is a matter of adding a config,
 * not restructuring the app.
 */

export interface AdminPeriod {
  label: string;
  from: string; // "YYYY-MM" format
  to: string | null; // null = ongoing (will use data bounds max)
}

export interface ThresholdEra {
  from: string;
  to: string;
  threshold: number;
  label: string;
  period: string;
  bandSize: number;
}

export interface JurisdictionConfig {
  slug: string;
  brandName: string;
  /** Brand split for styled rendering: prefix + accented suffix */
  brandPrefix: string;
  brandAccent: string;
  domain: string;
  dbFile: string;

  /** Area type used for sub-divisions (e.g. "borough", "riding") */
  areaType: string;

  /** Admin periods for date range presets */
  adminPeriods: {
    permits: AdminPeriod[];
    contracts: AdminPeriod[];
  };

  /** Scoring parameters */
  scoring: {
    permitTargetDays: number;
    previousTargetDays: number;
  };

  /** Inauguration dates for promise countdown */
  inauguration: {
    date: string; // "YYYY-MM-DD"
    deadline100Days: string; // "YYYY-MM-DD"
  };

  /** Intergovernmental suppliers excluded from contract analysis */
  intergovernmentalSuppliers: string[];

  /** Quebec procurement threshold eras */
  thresholdEras: ThresholdEra[];

  /** Data source info */
  dataSource: {
    name: string;
    url: string;
  };

  /** Which pages are enabled */
  features: {
    permits: boolean;
    contracts: boolean;
    promises: boolean;
    sr311: boolean;
    boroughs: boolean;
  };
}

const MONTREAL_CONFIG: JurisdictionConfig = {
  slug: "montreal",
  brandName: "MontréalScore",
  brandPrefix: "Montréal",
  brandAccent: "Score",
  domain: "montrealscore.ashwater.ca",
  dbFile: "montreal.db",
  areaType: "borough",

  adminPeriods: {
    permits: [
      { label: "Coderre (2014–2017)", from: "2014-01", to: "2017-10" },
      { label: "Plante (2017–2025)", from: "2017-11", to: "2025-10" },
      { label: "Martinez Ferrada (2025–)", from: "2025-11", to: null },
    ],
    contracts: [
      { label: "Coderre (2013–2017)", from: "2013-11", to: "2017-11" },
      { label: "Plante (2017–2025)", from: "2017-11", to: "2025-11" },
      { label: "Martinez Ferrada (2025–)", from: "2025-11", to: null },
    ],
  },

  scoring: {
    permitTargetDays: 90,
    previousTargetDays: 120,
  },

  inauguration: {
    date: "2025-11-10",
    deadline100Days: "2026-02-18",
  },

  intergovernmentalSuppliers: [
    "AUTORITE REGIONALE DE TRANSPORT METROPOLITAIN",
    "SOCIETE DE TRANSPORT DE MONTREAL (STM)",
    "TRUST ROYAL DU CANADA",
    "SOCIETE DU PARC JEAN-DRAPEAU",
    "COMMUNAUTE METROPOLITAINE DE MONTREAL",
    "COMMISSION DE LA CAISSE COMMUNE",
    "RESEAU DE TRANSPORT METROPOLITAIN",
    "CONSEIL DES ARTS DE MONTREAL",
    "(ABRPPVM) ASSOCIATION BIENFAISANCE ET RETRAITE DES POLICIERS",
    "CAISSE COMMUNE RETRAITE VILLE DE MONTREAL",
    "SYNDICAT DES FONCTIONNAIRES MUNICIPAUX DE MONTREAL",
    "SYNDICAT DES COLS BLEUS REGROUPES DE MONTREAL S.C.F.P. 301 / F.T.Q.",
    "ECOLE NATIONALE DE POLICE DU QUEBEC",
    "ASSOCIATION DES POMPIERS DE MONTREAL",
    "SOCIETE DE L'ASSURANCE AUTOMOBILE DU QUEBEC (S.A.A.Q.)",
  ],

  thresholdEras: [
    { from: "2011-01-01", to: "2017-07-01", threshold: 25000, label: "$25K", period: "2011–2017", bandSize: 5000 },
    { from: "2017-07-01", to: "2019-08-01", threshold: 100000, label: "$100K", period: "2017–2019", bandSize: 10000 },
    { from: "2019-08-01", to: "2022-01-01", threshold: 101100, label: "$101.1K", period: "2019–2021", bandSize: 10000 },
    { from: "2022-01-01", to: "2022-10-07", threshold: 105700, label: "$105.7K", period: "Jan–Oct 2022", bandSize: 10000 },
    { from: "2022-10-07", to: "2024-01-01", threshold: 121200, label: "$121.2K", period: "2022–2023", bandSize: 12000 },
    { from: "2024-01-01", to: "2026-01-01", threshold: 133800, label: "$133.8K", period: "2024–2025", bandSize: 13800 },
    { from: "2026-01-01", to: "2028-01-01", threshold: 139000, label: "$139K", period: "2026–2027", bandSize: 14000 },
  ],

  dataSource: {
    name: "donnees.montreal.ca",
    url: "https://donnees.montreal.ca",
  },

  features: {
    permits: true,
    contracts: true,
    promises: true,
    sr311: true,
    boroughs: false,
  },
};

const JURISDICTIONS: Record<string, JurisdictionConfig> = {
  montreal: MONTREAL_CONFIG,
};

/**
 * Get jurisdiction configuration by slug.
 * Currently always returns Montreal config.
 * Future: will support "quebec", "canada", etc.
 */
export function getJurisdiction(slug = "montreal"): JurisdictionConfig {
  const config = JURISDICTIONS[slug];
  if (!config) {
    throw new Error(`Unknown jurisdiction: ${slug}`);
  }
  return config;
}

/**
 * Build admin period presets for DateRangeSelector, replacing null `to`
 * with the provided data bounds max.
 */
export function buildPresets(
  periods: AdminPeriod[],
  boundsMax: string
): { label: string; from: string; to: string }[] {
  return periods.map((p) => ({
    label: p.label,
    from: p.from,
    to: p.to ?? boundsMax,
  }));
}
