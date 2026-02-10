import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = path.join(process.cwd(), "data", "montreal.db");

let _db: Database.Database | null = null;

export function getWriteDb(): Database.Database {
  if (!_db) {
    if (!fs.existsSync(DB_PATH)) {
      throw new Error(
        `Database not found at ${DB_PATH}. Run 'npm run etl:full' first.`
      );
    }
    _db = new Database(DB_PATH, { readonly: false });
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
  }
  return _db;
}
