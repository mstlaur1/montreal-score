/**
 * Seed script: loads campaign promises into the SQLite database.
 *
 * Usage:
 *   npm run promises:seed
 */

import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROMISE_SEEDS } from "../data/promises-seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data", "montreal.db");

function main() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const upsert = db.prepare(`
    INSERT INTO promises (id, category, subcategory, borough, text_fr, text_en,
      measurable, target_value, target_timeline, status, auto_trackable,
      data_source, first_100_days, created_at, updated_at)
    VALUES (@id, @category, @subcategory, @borough, @text_fr, @text_en,
      @measurable, @target_value, @target_timeline, 'not_started', @auto_trackable,
      @data_source, @first_100_days, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      category = excluded.category,
      subcategory = excluded.subcategory,
      borough = excluded.borough,
      text_fr = excluded.text_fr,
      text_en = excluded.text_en,
      measurable = excluded.measurable,
      target_value = excluded.target_value,
      target_timeline = excluded.target_timeline,
      auto_trackable = excluded.auto_trackable,
      data_source = excluded.data_source,
      first_100_days = excluded.first_100_days,
      updated_at = datetime('now')
  `);

  const insertMany = db.transaction((seeds: typeof PROMISE_SEEDS) => {
    for (const s of seeds) {
      upsert.run({
        ...s,
        borough: s.borough ?? null,
        subcategory: s.subcategory ?? null,
        target_value: s.target_value ?? null,
        target_timeline: s.target_timeline ?? null,
        data_source: s.data_source ?? null,
        measurable: s.measurable ? 1 : 0,
        auto_trackable: s.auto_trackable ? 1 : 0,
        first_100_days: s.first_100_days ? 1 : 0,
      });
    }
  });

  insertMany(PROMISE_SEEDS);
  db.close();
  console.log(`Seeded ${PROMISE_SEEDS.length} promises.`);
}

main();
