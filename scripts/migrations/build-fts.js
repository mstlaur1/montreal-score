#!/usr/bin/env node
/**
 * Build FTS5 full-text search index for the contracts table.
 * Run after ETL to enable fast text search. Safe to re-run (drops + recreates).
 *
 * Usage: node scripts/build-fts.js
 */
const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "..", "data", process.env.DB_FILE || "montreal.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

console.log("Dropping old FTS index (if any)...");
db.exec("DROP TABLE IF EXISTS contracts_fts");

console.log("Creating FTS5 virtual table...");
db.exec(`
  CREATE VIRTUAL TABLE contracts_fts USING fts5(
    supplier, service, description,
    tokenize = 'unicode61 remove_diacritics 2'
  )
`);

console.log("Populating FTS index from contracts...");
const insert = db.prepare(`
  INSERT INTO contracts_fts(rowid, supplier, service, description)
  SELECT rowid, COALESCE(supplier,''), COALESCE(service,''), COALESCE(description,'')
  FROM contracts
`);
const info = insert.run();
console.log(`Indexed ${info.changes} rows.`);

console.log("Optimizing FTS index...");
db.exec("INSERT INTO contracts_fts(contracts_fts) VALUES('optimize')");

db.close();
console.log("Done.");
