const Database = require("better-sqlite3");
const path = require("path");
const db = new Database(path.join(process.cwd(), "data", "montreal.db"));
db.pragma("foreign_keys = ON");

// === 1. REVERT 8 promises to not_started and delete their updates ===
const revertIds = [
  "housing-22", "housing-23", "environment-03", "culture-14",
  "security-18", "governance-12", "mobility-08", "mobility-13"
];

for (const id of revertIds) {
  db.prepare("UPDATE promises SET status = 'not_started', updated_at = datetime('now') WHERE id = ?").run(id);
  const del = db.prepare("DELETE FROM promise_updates WHERE promise_id = ?").run(id);
  console.log("REVERTED " + id + " (deleted " + del.changes + " updates)");
}

// === 2. FIX SOURCES — delete old update, insert corrected one ===
const fixes = [
  {
    id: "security-14",
    date: "2026-01-12",
    source_url: "https://www.ledevoir.com/politique/montreal/947382/securite-coeur-premier-budget-ensemble-montreal",
    source_title: "Le Devoir \u2014 La s\u00e9curit\u00e9 au c\u0153ur du premier budget d\u2019Ensemble Montr\u00e9al",
    summary_fr: "Le budget 2026 pr\u00e9voit 185,1 M$ pour le remplacement des v\u00e9hicules du SIM d\u2019ici 2035 et 67,3 M$ pour les \u00e9quipements. 6,4 M$ investis imm\u00e9diatement + 3,2 M$/an \u00e0 partir de 2026.",
    summary_en: "2026 budget: $185.1M for SIM vehicle replacement by 2035, $67.3M for equipment. $6.4M invested immediately + $3.2M/year starting 2026.",
    sentiment: "positive"
  },
  {
    id: "security-15",
    date: "2025-07-03",
    source_url: "https://www.newswire.ca/fr/news-releases/montreal-renforce-les-equipements-de-protection-du-personnel-pompier-890503413.html",
    source_title: "Newswire \u2014 Montr\u00e9al renforce les \u00e9quipements de protection du personnel pompier",
    summary_fr: "6,4 M$ investis imm\u00e9diatement pour am\u00e9liorations urgentes. 3,2 M$/an \u00e0 partir de 2026 pour le remplacement progressif des v\u00eatements de combat et l\u2019entretien.",
    summary_en: "$6.4M invested immediately for urgent improvements. $3.2M/year starting 2026 for progressive replacement of combat clothing and maintenance.",
    sentiment: "positive"
  },
  {
    id: "security-10",
    date: "2026-01-12",
    source_url: "https://www.ledevoir.com/politique/montreal/947382/securite-coeur-premier-budget-ensemble-montreal",
    source_title: "Le Devoir \u2014 La s\u00e9curit\u00e9 au c\u0153ur du premier budget d\u2019Ensemble Montr\u00e9al",
    summary_fr: "Budget s\u00e9curit\u00e9 2026 inclut des investissements pour s\u00e9curiser les trajets scolaires et augmenter les brigadiers.",
    summary_en: "2026 security budget includes investments to secure school routes and increase crossing guards.",
    sentiment: "positive"
  },
  {
    id: "security-04",
    date: "2025-12-08",
    source_url: "https://pivot.quebec/2025/12/08/ia-au-spvm-la-technologie-intrusive-au-service-dune-surveillance-policiere-illimitee/",
    source_title: "Pivot \u2014 IA au SPVM : la technologie intrusive au service d\u2019une surveillance polici\u00e8re illimit\u00e9e",
    summary_fr: "Le SPVM a acquis un logiciel d\u2019IA de vid\u00e9osurveillance pour 1,8 M$ capable d\u2019analyser 120 flux vid\u00e9o en direct simultan\u00e9ment. Le nom du logiciel reste confidentiel.",
    summary_en: "SPVM acquired AI video surveillance software for $1.8M capable of analyzing 120 live video feeds simultaneously. Software name remains confidential.",
    sentiment: "mixed"
  },
  {
    id: "mobility-09",
    date: "2026-01-05",
    source_url: "https://www.ledevoir.com/actualites/transports-urbanisme/945390/projets-transport-surveiller-2026",
    source_title: "Le Devoir \u2014 Des \u00e9tapes d\u00e9cisives en 2026 pour des projets de transport au Qu\u00e9bec",
    summary_fr: "Le projet structurant de l\u2019Est (tramway) est transf\u00e9r\u00e9 \u00e0 Mobilit\u00e9 Infra Qu\u00e9bec. L\u2019extension ouest du REM vers Sainte-Anne-de-Bellevue doit ouvrir au printemps 2026 avec 4 nouvelles stations.",
    summary_en: "Eastern structuring project (tramway) transferred to Mobilit\u00e9 Infra Qu\u00e9bec. Western REM extension to Sainte-Anne-de-Bellevue expected to open spring 2026 with 4 new stations.",
    sentiment: "positive"
  },
  {
    id: "housing-16",
    date: "2026-01-23",
    source_url: "https://www.cbc.ca/news/canada/montreal/montreal-mayor-housing-plan-9.7057648",
    source_title: "CBC News \u2014 Montreal aims to address housing crisis by easing rules for developers",
    summary_fr: "Abolition du R\u00e8glement pour une m\u00e9tropole mixte (RMM), remplac\u00e9 par une exigence simplifi\u00e9e de 20 % hors march\u00e9 pour les projets de 18 000+ m\u00b2. 80 terrains municipaux identifi\u00e9s pour le logement.",
    summary_en: "Abolished Mixed Metropolis Bylaw (RMM), replaced with simplified 20% off-market requirement for projects 18,000+ m\u00b2. 80 city-owned lots identified for housing.",
    sentiment: "positive"
  }
];

for (const fix of fixes) {
  db.prepare("DELETE FROM promise_updates WHERE promise_id = ?").run(fix.id);
  db.prepare(
    "INSERT INTO promise_updates (promise_id, date, source_url, source_title, summary_fr, summary_en, sentiment) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(fix.id, fix.date, fix.source_url, fix.source_title, fix.summary_fr, fix.summary_en, fix.sentiment);
  console.log("FIXED " + fix.id + " -> new source");
}

// === 3. ADJUST SUMMARIES ===

// culture-04: $2.5M, not $10M
db.prepare("DELETE FROM promise_updates WHERE promise_id = ?").run("culture-04");
db.prepare(
  "INSERT INTO promise_updates (promise_id, date, source_url, source_title, summary_fr, summary_en, sentiment) VALUES (?, ?, ?, ?, ?, ?, ?)"
).run(
  "culture-04", "2026-01-13",
  "https://journalmetro.com/culture/3206973/la-culture-au-c-ur-du-budget-2026-de-montreal/",
  "Journal M\u00e9tro \u2014 Culture Montr\u00e9al salue le budget 2026",
  "2,5 M$ suppl\u00e9mentaires allou\u00e9s en 2026 pour les biblioth\u00e8ques et Maisons de la culture. Progr\u00e8s partiel : 2,5 M$ sur les 10 M$ promis.",
  "+$2.5M allocated in 2026 for libraries and Maisons de la culture. Partial progress: $2.5M of the promised $10M.",
  "positive"
);
console.log("ADJUSTED culture-04 summary (partial: $2.5M of $10M)");

// culture-09: $1.2M, not $1.55M
db.prepare("DELETE FROM promise_updates WHERE promise_id = ?").run("culture-09");
db.prepare(
  "INSERT INTO promise_updates (promise_id, date, source_url, source_title, summary_fr, summary_en, sentiment) VALUES (?, ?, ?, ?, ?, ?, ?)"
).run(
  "culture-09", "2026-01-13",
  "https://journalmetro.com/culture/3206973/la-culture-au-c-ur-du-budget-2026-de-montreal/",
  "Journal M\u00e9tro \u2014 Culture Montr\u00e9al salue le budget 2026",
  "1,2 M$ allou\u00e9s dans le budget 2026 pour festivals et \u00e9v\u00e9nements culturels. Progr\u00e8s partiel : 1,2 M$ sur les 1,55 M$ promis.",
  "$1.2M allocated in 2026 for festivals and cultural events. Partial progress: $1.2M of the promised $1.55M.",
  "positive"
);
console.log("ADJUSTED culture-09 summary (partial: $1.2M of $1.55M)");

// === FINAL STATS ===
console.log("");
const counts = db.prepare("SELECT status, COUNT(*) as count FROM promises WHERE borough IS NULL AND first_100_days = 0 GROUP BY status").all();
console.log("Platform promise statuses after corrections:");
counts.forEach(r => console.log("  " + r.status + ": " + r.count));

const updates = db.prepare("SELECT COUNT(*) as count FROM promise_updates").get();
console.log("Total promise_updates: " + updates.count);

db.close();
