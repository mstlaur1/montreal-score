const Database = require("better-sqlite3");
const path = require("path");
const db = new Database(path.join(process.cwd(), "data", "montreal.db"));
db.pragma("foreign_keys = ON");

// === 1. REMOVE — bad relevance or pre-administration initiative ===
const removeIds = [
  "international-03", // Trade mission TO South Korea, not hosting events IN Montreal — wrong promise match
  "infrastructure-05", // 67.7%/32.3% split fabricated — not in the Newswire article
  "infrastructure-11", // Proanima contract signed Nov 2023 under Plante admin, Jan 2026 is just go-live date
];

console.log("=== REMOVING poor-quality entries ===");
for (const id of removeIds) {
  db.prepare("DELETE FROM promise_updates WHERE promise_id = ?").run(id);
  db.prepare("UPDATE promises SET status = 'not_started', updated_at = datetime('now') WHERE id = ?").run(id);
  console.log("REMOVED " + id);
}

// === 2. FIX infrastructure-06 — remove fabricated breakdown, keep confirmed figures ===
db.prepare("UPDATE promise_updates SET summary_en = ?, summary_fr = ? WHERE promise_id = ?").run(
  "2026 Budget: $7.67B operating + PDI 2026-2035: $25.9B capital plan. Road maintenance: $683.8M, street safety: $150M.",
  "Budget 2026 : 7,67 G$ en fonctionnement + PDI 2026-2035 : 25,9 G$ en immobilisations. Entretien routier : 683,8 M$, sécurisation des rues : 150 M$.",
  "infrastructure-06"
);
console.log("FIXED infrastructure-06 — corrected to verified figures only");

// === 3. FIX infrastructure-07 — correct $151.6M to $153.5M ===
db.prepare("UPDATE promise_updates SET summary_en = ?, summary_fr = ? WHERE promise_id = ?").run(
  "$153.5M allocated for Langelier sewer collector in 2026-2035 capital plan. Newly prioritized infrastructure investment.",
  "153,5 M$ alloués pour le collecteur Langelier dans le plan d'immobilisations 2026-2035. Investissement d'infrastructure nouvellement priorisé.",
  "infrastructure-07"
);
console.log("FIXED infrastructure-07 — corrected $151.6M to $153.5M");

// === FINAL STATS ===
console.log("\n=== FINAL STATS ===");
const counts = db.prepare("SELECT status, COUNT(*) as count FROM promises WHERE borough IS NULL AND first_100_days = 0 GROUP BY status").all();
console.log("Platform promise statuses:");
counts.forEach(r => console.log("  " + r.status + ": " + r.count));

const updates = db.prepare("SELECT COUNT(*) as count FROM promise_updates").get();
console.log("Total promise_updates: " + updates.count);

db.close();
