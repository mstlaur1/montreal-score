/**
 * Migration: adds `needs_help` column to promises table.
 * Safe to run multiple times — uses ALTER TABLE with try/catch.
 *
 * Usage:
 *   node scripts/add-needs-help.js                    # just add column
 *   node scripts/add-needs-help.js apply ids.json     # apply tags from JSON file
 *
 * The JSON file should be an array of promise IDs to tag as needs_help = 1.
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data", "montreal.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// 1. Add column if missing
try {
  db.exec("ALTER TABLE promises ADD COLUMN needs_help INTEGER NOT NULL DEFAULT 0");
  console.log("✅ Added needs_help column");
} catch {
  console.log("ℹ️  needs_help column already exists");
}

// 2. Optionally apply tags from a JSON file
const applyIdx = process.argv.indexOf("apply");
if (applyIdx !== -1) {
  const jsonPath = process.argv[applyIdx + 1];
  if (!jsonPath) {
    console.error("Usage: node scripts/add-needs-help.js apply <ids.json>");
    process.exit(1);
  }
  const ids = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  if (!Array.isArray(ids)) {
    console.error("JSON file must contain an array of promise IDs");
    process.exit(1);
  }

  // Reset all to 0 first, then set tagged ones to 1
  db.exec("UPDATE promises SET needs_help = 0");
  const stmt = db.prepare("UPDATE promises SET needs_help = 1 WHERE id = ?");
  const applyMany = db.transaction((ids) => {
    for (const id of ids) stmt.run(id);
  });
  applyMany(ids);

  const count = db.prepare("SELECT COUNT(*) AS n FROM promises WHERE needs_help = 1").get();
  console.log(`✅ Tagged ${count.n} promises as needs_help = 1`);
}

db.close();
