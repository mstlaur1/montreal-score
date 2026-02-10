#!/usr/bin/env node
/**
 * Add pre-computed processing_days column to permits table.
 * Eliminates expensive julianday() calls at query time.
 * Safe to re-run (idempotent).
 *
 * Usage: node scripts/migrations/add-processing-days.js
 */
const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "..", "data", "montreal.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Add column if missing
const cols = db.prepare("PRAGMA table_info(permits)").all();
const hasColumn = cols.some((c) => c.name === "processing_days");

if (!hasColumn) {
  console.log("Adding processing_days column...");
  db.exec("ALTER TABLE permits ADD COLUMN processing_days INTEGER");
} else {
  console.log("Column processing_days already exists.");
}

// Populate NULL rows (new or previously un-computed)
console.log("Populating processing_days for rows with NULL...");
const result = db.prepare(`
  UPDATE permits SET processing_days =
    CASE WHEN date_emission IS NOT NULL AND date_emission != '' AND date_debut IS NOT NULL
         THEN MAX(0, CAST(julianday(date_emission) - julianday(date_debut) AS INTEGER))
         ELSE NULL END
  WHERE processing_days IS NULL
`).run();
console.log(`  Updated ${result.changes} rows.`);

// Create covering index if missing
console.log("Creating covering index...");
db.exec("CREATE INDEX IF NOT EXISTS idx_permits_range_stats ON permits(date_debut, arrondissement, processing_days, nb_logements, permit_type)");

db.close();
console.log("Done.");
