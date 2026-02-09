/** Raw permit record from Montreal open data */
export interface RawPermit {
  no_demande: number;
  id_permis: number | null;
  date_debut: string | null;
  date_emission: string | null;
  emplacement: string | null;
  arrondissement: string | null;
  code_type_base_demande: "TR" | "DE" | "CO" | "CA";
  description_type_demande: string | null;
  description_type_batiment: string | null;
  description_categorie_batiment: string | null;
  nature_travaux: string | null;
  nb_logements: number | null;
  longitude: number | null;
  latitude: number | null;
}

/** Processed permit with calculated fields */
export interface Permit {
  id: number;
  application_date: string;
  issue_date: string | null;
  processing_days: number | null;
  address: string | null;
  borough: string;
  type_code: "TR" | "DE" | "CO" | "CA";
  type_description: string | null;
  building_type: string | null;
  building_category: string | null;
  work_nature: string | null;
  housing_units: number | null;
  longitude: number | null;
  latitude: number | null;
}

/** Borough-level permit statistics */
export interface BoroughPermitStats {
  borough: string;
  slug: string;
  total_permits: number;
  permits_issued: number;
  permits_pending: number;
  median_processing_days: number;
  avg_processing_days: number;
  p90_processing_days: number;
  pct_within_90_days: number;
  pct_within_120_days: number;
  trend_vs_last_year: number; // negative = improving
  year: number;
}

/** Borough grade */
export type Grade = "A" | "B" | "C" | "D" | "F";

/** Borough scorecard */
export interface BoroughScore {
  borough: string;
  slug: string;
  overall_grade: Grade;
  overall_score: number; // 0-100
  permits_grade: Grade;
  permits_score: number;
  // Future categories
  responsiveness_grade?: Grade;
  responsiveness_score?: number;
  infrastructure_grade?: Grade;
  infrastructure_score?: number;
  safety_grade?: Grade;
  safety_score?: number;
  fiscal_grade?: Grade;
  fiscal_score?: number;
}

/** Time series data point for charts */
export interface TimeSeriesPoint {
  date: string;
  value: number;
  label?: string;
}

/** Borough comparison for bar charts */
export interface BoroughComparison {
  borough: string;
  slug: string;
  value: number;
  target?: number;
  grade: Grade;
}

/** Raw contract record from Montreal open data */
export interface RawContract {
  _id: number;
  "NOM DU FOURNISSEUR": string;
  NUMERO: string;
  "DATE D'APPROBATION": string;
  APPROBATEUR: string | null;
  DESCRIPTION: string;
  SERVICE: string;
  ACTIVITE: string;
  MONTANT: string; // stored as text in CKAN
}

/** Aggregated contract statistics for display */
export interface ContractStats {
  totalContracts: number;
  totalValue: number;
  avgValue: number;
  medianValue: number;
  topSuppliers: { name: string; count: number; totalValue: number }[];
  topDepartments: { name: string; count: number; totalValue: number }[];
  /** % of total spend captured by top 10 suppliers */
  top10ConcentrationPct: number;
  /** Distribution buckets for histogram */
  distribution: { label: string; min: number; max: number; count: number; totalValue: number }[];
  /** Contracts in "just below threshold" zones */
  thresholdClusters: {
    threshold: number; label: string; period: string;
    count: number; expected: number;
    belowThreshold: number; totalInEra: number;
  }[];
  from: string;
  to: string;
}

/** City-wide summary stats */
export interface CitySummary {
  total_permits_ytd: number;
  median_processing_days: number;
  pct_within_target: number;
  target_days: number;
  best_borough: string;
  worst_borough: string;
  trend_vs_last_year: number;
  last_updated: string;
}
