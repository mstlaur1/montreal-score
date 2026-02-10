const Database = require("better-sqlite3");
const path = require("path");
const db = new Database(path.join(process.cwd(), "data", "montreal.db"));
db.pragma("foreign_keys = ON");

// === 1. REMOVE pre-administration articles (before Nov 10, 2025) ===
const removeIds = [
  "downtown-03",    // 2025-08-25
  "economy-19",     // 2025-11-02
  "economy-27",     // 2025-06-20
  "housing-12",     // 2025-09-15
  "housing-17",     // 2025-05-22
  "infrastructure-03", // 2024-02-05
  "security-15",    // 2025-07-03
  "housing-02",     // 404 URL - source no longer exists
];

console.log("=== REMOVING pre-administration / broken entries ===");
for (const id of removeIds) {
  db.prepare("DELETE FROM promise_updates WHERE promise_id = ?").run(id);
  db.prepare("UPDATE promises SET status = 'not_started', updated_at = datetime('now') WHERE id = ?").run(id);
  console.log("REMOVED " + id);
}

// === 2. STANDARDIZE source titles ===
// Format: {Headline} - {Source} [{Date}]
const titleUpdates = [
  { promise_id: "cleanliness-05", new_title: "Dépôt du budget 2026 et du PDI 2026-2035 - Ville de Montréal [2026-01-12]" },
  { promise_id: "culture-01", new_title: "La Ville bonifie le budget du Conseil des arts - La Presse [2026-01-12]" },
  { promise_id: "culture-03", new_title: "2,5 millions de plus pour le Conseil des arts de Montréal - Le Devoir [2026-01-12]" },
  { promise_id: "culture-04", new_title: "Culture Montréal salue le budget 2026 - Journal Métro [2026-01-13]" },
  { promise_id: "culture-09", new_title: "Culture Montréal salue le budget 2026 - Journal Métro [2026-01-13]" },
  { promise_id: "east-montreal-02", new_title: "Budget 2026 de Montréal : environ 1 G$ pour l'Est d'ici 2035 - EST MÉDIA Montréal [2026-01-13]" },
  { promise_id: "east-montreal-03", new_title: "Budget 2026 de la Ville de Montréal : L'Est au cœur des priorités - Chambre de commerce de l'Est [2026-01-13]" },
  { promise_id: "east-montreal-06", new_title: "Budget 2026 de Montréal : environ 1 G$ pour l'Est d'ici 2035 - EST MÉDIA Montréal [2026-01-13]" },
  { promise_id: "east-montreal-07", new_title: "Budget 2026 de Montréal : environ 1 G$ pour l'Est d'ici 2035 - EST MÉDIA Montréal [2026-01-13]" },
  { promise_id: "east-montreal-09", new_title: "Budget 2026 de Montréal : environ 1 G$ pour l'Est d'ici 2035 - EST MÉDIA Montréal [2026-01-13]" },
  { promise_id: "environment-07", new_title: "Dépôt du budget 2026 et du PDI 2026-2035 - Ville de Montréal [2026-01-12]" },
  { promise_id: "environment-08", new_title: "Dépôt du budget 2026 et du PDI 2026-2035 - Ville de Montréal [2026-01-12]" },
  { promise_id: "environment-09", new_title: "Dépôt du budget 2026 et du PDI 2026-2035 - Ville de Montréal [2026-01-12]" },
  { promise_id: "governance-01", new_title: "La mairesse Martinez Ferrada dévoile son comité exécutif - La Presse [2025-11-18]" },
  { promise_id: "governance-02", new_title: "Déjà de l'IA pour améliorer l'efficience de la Ville de Montréal - Journal Métro [2026-01-19]" },
  { promise_id: "governance-03", new_title: "Property tax rates jump, more money for homelessness in Montreal budget - CBC News [2026-01-12]" },
  { promise_id: "governance-04", new_title: "Gel des embauches externes - Newswire [2025-11-21]" },
  { promise_id: "governance-06", new_title: "Montréal : un budget et des taxes qui augmentent plus vite que l'inflation - Radio-Canada [2026-01-12]" },
  { promise_id: "governance-10", new_title: "Déjà de l'IA pour améliorer l'efficience de la Ville de Montréal - Journal Métro [2026-01-19]" },
  { promise_id: "homelessness-01", new_title: "Une pluie de millions pour contrer l'itinérance - La Presse [2026-01-12]" },
  { promise_id: "homelessness-02", new_title: "Une pluie de millions pour contrer l'itinérance - La Presse [2026-01-12]" },
  { promise_id: "homelessness-03", new_title: "Une pluie de millions pour contrer l'itinérance - La Presse [2026-01-12]" },
  { promise_id: "homelessness-04", new_title: "De nouvelles habitations modulaires pour loger des sans-abri - La Presse [2026-02-02]" },
  { promise_id: "homelessness-05", new_title: "Property tax rates jump, more money for homelessness in Montreal budget - CBC News [2026-01-12]" },
  { promise_id: "homelessness-07", new_title: "Dépôt du budget 2026 et du PDI 2026-2035 - Ville de Montréal [2026-01-12]" },
  { promise_id: "homelessness-08", new_title: "Une pluie de millions pour contrer l'itinérance - La Presse [2026-01-12]" },
  { promise_id: "homelessness-09", new_title: "Dépôt du budget 2026 et du PDI 2026-2035 - Ville de Montréal [2026-01-12]" },
  { promise_id: "homelessness-10", new_title: "Une pluie de millions pour contrer l'itinérance - La Presse [2026-01-12]" },
  { promise_id: "homelessness-13", new_title: "Property tax rates jump, more money for homelessness in Montreal budget - CBC News [2026-01-12]" },
  { promise_id: "housing-01", new_title: "Montréal met la hache dans le Règlement pour une métropole mixte - La Presse [2026-01-23]" },
  { promise_id: "housing-13", new_title: "10 actions en 100 jours - Ville de Montréal [2026-01-23]" },
  { promise_id: "housing-15", new_title: "Crise du logement : Soraya Martinez Ferrada sonne le glas du RMM - Radio-Canada [2026-01-20]" },
  { promise_id: "housing-16", new_title: "Montreal aims to address housing crisis by easing rules for developers - CBC News [2026-01-23]" },
  { promise_id: "infrastructure-05", new_title: "Dépôt du budget 2026 et du PDI 2026-2035 - Ville de Montréal [2026-01-12]" },
  { promise_id: "infrastructure-06", new_title: "Dépôt du budget 2026 et du PDI 2026-2035 - Ville de Montréal [2026-01-12]" },
  { promise_id: "infrastructure-07", new_title: "Budget 2026 de Montréal : environ 1 G$ pour l'Est d'ici 2035 - EST MÉDIA Montréal [2026-01-13]" },
  { promise_id: "infrastructure-10", new_title: "Dépôt du budget 2026 et du PDI 2026-2035 - Ville de Montréal [2026-01-12]" },
  { promise_id: "international-04", new_title: "Major events coming to Montréal in 2026 - Tourisme Montréal [2025-12-09]" },
  { promise_id: "mobility-01", new_title: "Audit sur les pistes cyclables à Montréal : La nouvelle administration maintient le flou - La Presse [2026-01-16]" },
  { promise_id: "mobility-09", new_title: "Les projets de transport à surveiller en 2026 - Le Devoir [2026-01-05]" },
  { promise_id: "mobility-10", new_title: "Dépôt du budget 2026 et du PDI 2026-2035 - Ville de Montréal [2026-01-12]" },
  { promise_id: "mobility-19", new_title: "Property tax rates jump, more money for homelessness in Montreal budget - CBC News [2026-01-12]" },
  { promise_id: "security-01", new_title: "La sécurité au cœur du premier budget d'Ensemble Montréal - Le Devoir [2026-01-12]" },
  { promise_id: "security-02", new_title: "Caméras corporelles : Montréal met la pression sur Québec - La Presse [2026-01-26]" },
  { promise_id: "security-04", new_title: "IA au SPVM : la technologie intrusive au service d'une surveillance policière illimitée - Pivot [2025-12-08]" },
  { promise_id: "security-08", new_title: "Property tax rates jump, more money for homelessness in Montreal budget - CBC News [2026-01-12]" },
  { promise_id: "security-10", new_title: "La sécurité au cœur du premier budget d'Ensemble Montréal - Le Devoir [2026-01-12]" },
  { promise_id: "security-13", new_title: "Dépôt du budget 2026 et du PDI 2026-2035 - Ville de Montréal [2026-01-12]" },
  { promise_id: "security-14", new_title: "La sécurité au cœur du premier budget d'Ensemble Montréal - Le Devoir [2026-01-12]" },
  // Error items — standardize with best available info
  { promise_id: "downtown-01", new_title: "Caméras de sécurité urbaine - SPVM [2026-01-15]" },
  { promise_id: "infrastructure-11", new_title: "Nouveau partenariat avec la Ville de Montréal - Proanima [2026-01-01]" },
  { promise_id: "international-01", new_title: "Montreal launches first-ever international strategy - Montreal Gazette [2025-12-10]" },
  { promise_id: "international-03", new_title: "Mission Corée du Sud - Conseil des arts de Montréal [2026-02-01]" },
];

console.log("\n=== STANDARDIZING source titles ===");
const updateStmt = db.prepare("UPDATE promise_updates SET source_title = ? WHERE promise_id = ?");
for (const u of titleUpdates) {
  const result = updateStmt.run(u.new_title, u.promise_id);
  console.log((result.changes > 0 ? "UPDATED" : "SKIPPED") + " " + u.promise_id + " -> " + u.new_title);
}

// === FINAL STATS ===
console.log("\n=== FINAL STATS ===");
const counts = db.prepare("SELECT status, COUNT(*) as count FROM promises WHERE borough IS NULL AND first_100_days = 0 GROUP BY status").all();
console.log("Platform promise statuses:");
counts.forEach(r => console.log("  " + r.status + ": " + r.count));

const updates = db.prepare("SELECT COUNT(*) as count FROM promise_updates").get();
console.log("Total promise_updates: " + updates.count);

db.close();
