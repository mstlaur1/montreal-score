/**
 * Supplier name normalization for Montreal contract data.
 *
 * The city's 5 contract datasets contain thousands of supplier name variants
 * (typos, casing, trailing punctuation, Quebec inc numbers appended differently).
 * This module maps known variants to canonical names so concentration analysis
 * reflects reality.
 */

/** Manual overrides for the biggest suppliers with known variants. */
const CANONICAL_MAP: Record<string, string> = {
  // Duroking — 14 variants, $257M+
  "DUROKING CONSTRUCTION": "DUROKING CONSTRUCTION",
  "DUROKING CONSTRUCTION INC.": "DUROKING CONSTRUCTION",
  "DUROKING CONSTRUCTION (9200-2088 QUEBEC INC.)": "DUROKING CONSTRUCTION",
  "DUROKING CONSTRUCTION (9200 2088 QUÉBEC INC.)": "DUROKING CONSTRUCTION",
  "DUROKING CONSTRUCTION / 9200-2088 QUÉBEC INC.": "DUROKING CONSTRUCTION",
  "DUROKING CONSTRUCTION / 9200-2088 QUÉBEC INC,": "DUROKING CONSTRUCTION",
  "DUROKING CONSTRUCTION / 9200-2088 QUÉBEC INC..": "DUROKING CONSTRUCTION",
  "DUROKING CONSTRUCTION / 9200 2088 QUÉBEC INC.": "DUROKING CONSTRUCTION",
  "DUROKING CONSTRUCTION - 9200-2088 QUÉBEC INC.": "DUROKING CONSTRUCTION",
  "DUROKING CONSTRUCTION - 9200-2088 QUÉBEC INC": "DUROKING CONSTRUCTION",
  "9200-2088 QUEBEC INC / DUROKING CONSTRUCTION": "DUROKING CONSTRUCTION",
  "DUROKING CONSTRUCTION 9200-2088 QUÉBEC INC.": "DUROKING CONSTRUCTION",
  "TECHNOLOGIES DUROKING INC": "DUROKING CONSTRUCTION",

  // Pomerleau — 4 variants, $677M
  "POMERLEAU": "POMERLEAU INC.",
  "POMERLEAU INC": "POMERLEAU INC.",
  "POMERLEAU INC.": "POMERLEAU INC.",

  // Roxboro — 6 variants, $544M
  "ROXBORO EXCAVATION INC": "ROXBORO EXCAVATION INC.",
  "ROXBORO EXACAVATION INC.": "ROXBORO EXCAVATION INC.",
  "ROXBORO EXCAVATION": "ROXBORO EXCAVATION INC.",

  // Loiselle — 3 variants, $459M
  "LOISELLE INC": "LOISELLE INC.",
  "LOISELLE INC,": "LOISELLE INC.",

  // EBC — 2 variants, $448M
  "EBC": "EBC INC.",

  // Sanexen — 9 variants, $533M
  "SANEXEN SERVICES ENVIRONNEMENTAUX INC": "SANEXEN SERVICES ENVIRONNEMENTAUX INC.",
  "SANEXEN ENVIRONNEMENTAUX INC.": "SANEXEN SERVICES ENVIRONNEMENTAUX INC.",
  "SANEXEN SERVICES ENVIRONNEMENTAUX": "SANEXEN SERVICES ENVIRONNEMENTAUX INC.",
  "SANEXEN SERVICES ENVORONNEMENTAUX INC.": "SANEXEN SERVICES ENVIRONNEMENTAUX INC.",
  "SANEXEN SERVICES ENVIRONNEMENTAUX INC.,": "SANEXEN SERVICES ENVIRONNEMENTAUX INC.",
  "SANEXEN": "SANEXEN SERVICES ENVIRONNEMENTAUX INC.",

  // Eurovia Grands Projets — multiple variants
  "EUROVIA QUÉBEC GRANDS PROJETS": "EUROVIA QUÉBEC GRANDS PROJETS INC.",
  "EUROVIA QUÉBEC GRANDS PROJETS INC": "EUROVIA QUÉBEC GRANDS PROJETS INC.",
  "EUROVIA QUÉBEC GRANS PROJETS INC.": "EUROVIA QUÉBEC GRANDS PROJETS INC.",
  "EUROVIA GRANDS PROJETS INC.": "EUROVIA QUÉBEC GRANDS PROJETS INC.",

  // Eurovia Construction — multiple variants
  "EUROVIA QUÉBEC CONSTRUCTION INC": "EUROVIA QUÉBEC CONSTRUCTION INC.",
  "EUROVIA QUEBEC CONSTRUCTION INC.": "EUROVIA QUÉBEC CONSTRUCTION INC.",
  "EUROVIA QUÉBEC INC.": "EUROVIA QUÉBEC CONSTRUCTION INC.",
  "EUROVIA QUÉBEC": "EUROVIA QUÉBEC CONSTRUCTION INC.",

  // Environnement Routier NRJ — 10 variants, $334M
  "ENVIRONNEMENT ROUTIER NRJ INC": "ENVIRONNEMENT ROUTIER NRJ INC.",
  "ENVIRONNEMENT ROUTIER INC.": "ENVIRONNEMENT ROUTIER NRJ INC.",
  "ENVIRONNEMENT ROUTHIER NRJ INC.": "ENVIRONNEMENT ROUTIER NRJ INC.",
  "ENVIRONNEMENT ROUTHIER NRJ INC": "ENVIRONNEMENT ROUTIER NRJ INC.",
  "ENVIRONNEMENT ROUTIERS NRJ INC": "ENVIRONNEMENT ROUTIER NRJ INC.",
  "ENVIRONNEMENT NRJ INC.": "ENVIRONNEMENT ROUTIER NRJ INC.",

  // GFL — 6 variants, $301M
  "GFL ENVIRONMENTAL INC": "GFL ENVIRONMENTAL INC.",
  "GFL ENVIONMENTAL INC.": "GFL ENVIRONMENTAL INC.",
  "GFL ENVIRONNEMENTAL INC.": "GFL ENVIRONMENTAL INC.",
  "GFL ENVIRONMENTAL INC (SERVICES MATREC)": "GFL ENVIRONMENTAL INC.",
  "GFL ENVIRONMENTAL INC. ET LES ENTREPRISES PEP2000 INC.": "GFL ENVIRONMENTAL INC.",

  // SUEZ — 2 variants, $379M
  "SUEZ CANADA WASTE SERVICE INC.": "SUEZ CANADA WASTE SERVICES INC.",

  // G-TEK
  "G-TEK (8246408 CANADA INC.)": "G-TEK",

  // Insituform — 4 variants, $231M
  "INSITUFORM TECHNOLOGIE": "INSITUFORM TECHNOLOGIES LIMITED",
  "INSITUFORM TECHNOLOGIES LIMITED,": "INSITUFORM TECHNOLOGIES LIMITED",
  "INSITUFORM TECHNONOLOGIES LIMITED": "INSITUFORM TECHNOLOGIES LIMITED",

  // Charex — 6 variants, $242M
  "CHAREX INC": "CHAREX INC.",
  "CHAREX INC,": "CHAREX INC.",

  // C.M.S. — 5 variants, $222M
  "C.M.S. ENTREPRENEURE GÉNÉRAUX INC.": "C.M.S. ENTREPRENEURS GÉNÉRAUX INC.",
  "C.M.S. ENTREPRENEURS GÉNÉRAUX INC": "C.M.S. ENTREPRENEURS GÉNÉRAUX INC.",
  "C.M.S. ENTREPRENEURS GÉNÉRAUX": "C.M.S. ENTREPRENEURS GÉNÉRAUX INC.",
  "C.M.S. ENTREPRENEURS GENERAUX INC.": "C.M.S. ENTREPRENEURS GÉNÉRAUX INC.",

  // Bucaro — 7 variants, $201M
  "LES ENTREPRENEURS BUCARO INC": "LES ENTREPRENEURS BUCARO INC.",
  "LES ENTREPRENEURS BUCARO": "LES ENTREPRENEURS BUCARO INC.",

  // Michaudville — variants, $653M+
  "LES ENTREPRISES MICHAUDVILLE INC.,": "LES ENTREPRISES MICHAUDVILLE INC.",
  "LES ENTREPRISES MICHAUDVILLE INC., PAVAGES D'AMOUR INC.": "LES ENTREPRISES MICHAUDVILLE INC.",
  "LES ENTREPRISES MICHAUDVILLE (VOLET 1)": "LES ENTREPRISES MICHAUDVILLE INC.",

  // Groupe TNT — 4 variants, $313M
  "GROUPE TNT INC": "GROUPE TNT INC.",
  "GROUPE TNT": "GROUPE TNT INC.",
  "GROUPE T.N.T. INC.": "GROUPE TNT INC.",

  // Services EXP — 8 variants, $290M
  "LES SERVICES EXP": "LES SERVICES EXP INC.",
  "LES SERVICES EXP. INC.": "LES SERVICES EXP INC.",
  "LES SERVICES EXP IINC.": "LES SERVICES EXP INC.",
  "LES SERVICES EXP INC": "LES SERVICES EXP INC.",

  // Hydro-Québec — 4 variants
  "HYDRO-QUEBEC": "HYDRO-QUÉBEC",
  "HYDRO QUÉBEC": "HYDRO-QUÉBEC",

  // Groupe Plombaction
  "GROUPE PLOMBACTION INC": "GROUPE PLOMBACTION INC.",

  // Groupe Unigesco
  "GROUPE UNIGESCO": "GROUPE UNIGESCO INC.",

  // Proanima
  "PROANIMA MONTREAL": "PROANIMA MONTRÉAL",
  "PROANIMA": "PROANIMA MONTRÉAL",

  // E360S
  "9386-0120 QUÉBEC INC. (E360S)": "9386-0120 QUÉBEC INC.",

  // Entreprise de Construction T.E.Q.
  "ENTREPRISE DE CONSTUCTION T.E.Q. INC.": "ENTREPRISE DE CONSTRUCTION T.E.Q. INC.",
  "ENTREPRISE DE CONSTRUCTION TEQ INC.": "ENTREPRISE DE CONSTRUCTION T.E.Q. INC.",

  // Construction Bau-Val
  "CONSTRUCTION BAU-VAL INC": "CONSTRUCTION BAU-VAL INC.",
};

// Build a case-insensitive lookup
const normalizedMap = new Map<string, string>();
for (const [key, value] of Object.entries(CANONICAL_MAP)) {
  normalizedMap.set(key.toUpperCase().trim(), value);
}

/**
 * Normalize a supplier name to its canonical form.
 * 1. Check manual overrides (case-insensitive)
 * 2. Normalize casing and whitespace
 */
export function normalizeSupplierName(name: string): string {
  if (!name) return name;

  // Trim and collapse whitespace
  const cleaned = name.trim().replace(/\s+/g, " ");
  const upper = cleaned.toUpperCase();

  // Check manual map
  const mapped = normalizedMap.get(upper);
  if (mapped) return mapped;

  // Generic cleanup: strip trailing commas, normalize to uppercase
  // Keep trailing dots since they're meaningful in company names (INC., LTÉE.)
  return upper.replace(/,$/, "").trim();
}

/**
 * Get normalization examples for display (canonical → variant count).
 * Returns the top entries by number of variants merged.
 */
export function getNormalizationExamples(): { canonical: string; variantCount: number; sampleVariants: string[] }[] {
  // Invert the map: canonical → list of variants
  const byCanonical = new Map<string, string[]>();
  for (const [variant, canonical] of Object.entries(CANONICAL_MAP)) {
    // Skip identity mappings
    if (variant === canonical) continue;
    const list = byCanonical.get(canonical) ?? [];
    list.push(variant);
    byCanonical.set(canonical, list);
  }

  return [...byCanonical.entries()]
    .map(([canonical, variants]) => ({
      canonical,
      variantCount: variants.length + 1, // +1 for the canonical itself
      sampleVariants: variants.slice(0, 3),
    }))
    .sort((a, b) => b.variantCount - a.variantCount)
    .slice(0, 8);
}
