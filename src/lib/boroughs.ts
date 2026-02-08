/** Montreal's 19 boroughs with their official names and slugs */
export const BOROUGHS = [
  { name: "Ahuntsic-Cartierville", slug: "ahuntsic-cartierville" },
  { name: "Anjou", slug: "anjou" },
  { name: "Côte-des-Neiges-Notre-Dame-de-Grâce", slug: "cdnndg" },
  { name: "Lachine", slug: "lachine" },
  { name: "LaSalle", slug: "lasalle" },
  { name: "Le Plateau-Mont-Royal", slug: "plateau-mont-royal" },
  { name: "Le Sud-Ouest", slug: "le-sud-ouest" },
  { name: "L'Île-Bizard-Sainte-Geneviève", slug: "ile-bizard-sainte-genevieve" },
  { name: "Mercier-Hochelaga-Maisonneuve", slug: "mercier-hochelaga-maisonneuve" },
  { name: "Montréal-Nord", slug: "montreal-nord" },
  { name: "Outremont", slug: "outremont" },
  { name: "Pierrefonds-Roxboro", slug: "pierrefonds-roxboro" },
  { name: "Rivière-des-Prairies-Pointe-aux-Trembles", slug: "rdp-pat" },
  { name: "Rosemont-La Petite-Patrie", slug: "rosemont-la-petite-patrie" },
  { name: "Saint-Laurent", slug: "saint-laurent" },
  { name: "Saint-Léonard", slug: "saint-leonard" },
  { name: "Verdun", slug: "verdun" },
  { name: "Ville-Marie", slug: "ville-marie" },
  { name: "Villeray-Saint-Michel-Parc-Extension", slug: "villeray-saint-michel-parc-extension" },
] as const;

export type BoroughName = (typeof BOROUGHS)[number]["name"];
export type BoroughSlug = (typeof BOROUGHS)[number]["slug"];

/** Map borough names from the dataset (which may vary) to canonical names */
export function normalizeBoroughName(raw: string): string {
  const normalized = raw.trim();

  // Handle common variations in the dataset
  const aliases: Record<string, string> = {
    "Côte-des-Neiges—Notre-Dame-de-Grâce": "Côte-des-Neiges-Notre-Dame-de-Grâce",
    "CDN-NDG": "Côte-des-Neiges-Notre-Dame-de-Grâce",
    "Mercier—Hochelaga-Maisonneuve": "Mercier-Hochelaga-Maisonneuve",
    "Le Plateau-Mont-Royal": "Le Plateau-Mont-Royal",
    "Plateau-Mont-Royal": "Le Plateau-Mont-Royal",
    "Plateau Mont-Royal": "Le Plateau-Mont-Royal",
    "Le Sud-Ouest": "Le Sud-Ouest",
    "Sud-Ouest": "Le Sud-Ouest",
    "L'Île-Bizard—Sainte-Geneviève": "L'Île-Bizard-Sainte-Geneviève",
    "Île-Bizard—Sainte-Geneviève": "L'Île-Bizard-Sainte-Geneviève",
    "Rivière-des-Prairies—Pointe-aux-Trembles": "Rivière-des-Prairies-Pointe-aux-Trembles",
    "RDP-PAT": "Rivière-des-Prairies-Pointe-aux-Trembles",
    "Villeray—Saint-Michel—Parc-Extension": "Villeray-Saint-Michel-Parc-Extension",
    "Villeray-Saint-Michel-Parc-Extension": "Villeray-Saint-Michel-Parc-Extension",
    "Montréal-Nord": "Montréal-Nord",
    "Montreal-Nord": "Montréal-Nord",
    "Saint-Leonard": "Saint-Léonard",
  };

  // Replace em-dash with hyphen for matching
  const withHyphens = normalized.replace(/\u2014/g, "-").replace(/\u2013/g, "-");

  return aliases[withHyphens] || aliases[normalized] || normalized;
}

export function getBoroughSlug(name: string): string {
  const canonical = normalizeBoroughName(name);
  const found = BOROUGHS.find((b) => b.name === canonical);
  if (found) return found.slug;
  // Fallback: slugify the name
  return canonical
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getBoroughBySlug(slug: string) {
  return BOROUGHS.find((b) => b.slug === slug);
}
