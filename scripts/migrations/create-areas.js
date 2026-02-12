#!/usr/bin/env node
/**
 * Create areas, area_attributes, and area_aliases tables.
 * Seed with Canada → Quebec → Montreal → 19 boroughs hierarchy.
 * Safe to re-run (idempotent).
 *
 * Usage: node scripts/migrations/create-areas.js
 */
const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "..", "data", process.env.DB_FILE || "montreal.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// --- Create tables ---
console.log("Creating areas tables...");

db.exec(`
  CREATE TABLE IF NOT EXISTS areas (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    slug       TEXT NOT NULL UNIQUE,
    type       TEXT NOT NULL,
    parent_id  INTEGER REFERENCES areas(id),
    name_fr    TEXT NOT NULL,
    name_en    TEXT NOT NULL,
    code       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS area_attributes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    area_id        INTEGER NOT NULL REFERENCES areas(id),
    attribute_key  TEXT NOT NULL,
    value          REAL NOT NULL,
    effective_date TEXT NOT NULL,
    source         TEXT,
    UNIQUE(area_id, attribute_key, effective_date)
  );

  CREATE TABLE IF NOT EXISTS area_aliases (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    area_id  INTEGER NOT NULL REFERENCES areas(id),
    alias    TEXT NOT NULL UNIQUE,
    source   TEXT
  );
`);

// --- Seed hierarchy: Canada → Quebec → Montreal → 19 boroughs ---

const insertArea = db.prepare(`
  INSERT OR IGNORE INTO areas (slug, type, parent_id, name_fr, name_en, code)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const getAreaId = db.prepare(`SELECT id FROM areas WHERE slug = ?`);

const insertAttribute = db.prepare(`
  INSERT OR IGNORE INTO area_attributes (area_id, attribute_key, value, effective_date, source)
  VALUES (?, ?, ?, ?, ?)
`);

const insertAlias = db.prepare(`
  INSERT OR IGNORE INTO area_aliases (area_id, alias, source)
  VALUES (?, ?, ?)
`);

const seed = db.transaction(() => {
  // Country
  insertArea.run("canada", "country", null, "Canada", "Canada", "CAN");
  const canadaId = getAreaId.get("canada")?.id;

  // Province
  insertArea.run("quebec", "province", canadaId, "Québec", "Quebec", "QC");
  const quebecId = getAreaId.get("quebec")?.id;

  // City
  insertArea.run("montreal", "city", quebecId, "Montréal", "Montreal", "2466023");
  const montrealId = getAreaId.get("montreal")?.id;

  // 19 boroughs with 2021 census populations
  const boroughs = [
    { slug: "ahuntsic-cartierville", fr: "Ahuntsic-Cartierville", en: "Ahuntsic-Cartierville", pop: 139590 },
    { slug: "anjou", fr: "Anjou", en: "Anjou", pop: 45802 },
    { slug: "cdnndg", fr: "Côte-des-Neiges-Notre-Dame-de-Grâce", en: "Côte-des-Neiges-Notre-Dame-de-Grâce", pop: 174885 },
    { slug: "lachine", fr: "Lachine", en: "Lachine", pop: 47322 },
    { slug: "lasalle", fr: "LaSalle", en: "LaSalle", pop: 80161 },
    { slug: "plateau-mont-royal", fr: "Le Plateau-Mont-Royal", en: "Le Plateau-Mont-Royal", pop: 107796 },
    { slug: "le-sud-ouest", fr: "Le Sud-Ouest", en: "Le Sud-Ouest", pop: 81280 },
    { slug: "ile-bizard-sainte-genevieve", fr: "L'Île-Bizard-Sainte-Geneviève", en: "L'Île-Bizard-Sainte-Geneviève", pop: 19328 },
    { slug: "mercier-hochelaga-maisonneuve", fr: "Mercier-Hochelaga-Maisonneuve", en: "Mercier-Hochelaga-Maisonneuve", pop: 141590 },
    { slug: "montreal-nord", fr: "Montréal-Nord", en: "Montréal-Nord", pop: 87027 },
    { slug: "outremont", fr: "Outremont", en: "Outremont", pop: 26143 },
    { slug: "pierrefonds-roxboro", fr: "Pierrefonds-Roxboro", en: "Pierrefonds-Roxboro", pop: 72651 },
    { slug: "rdp-pat", fr: "Rivière-des-Prairies-Pointe-aux-Trembles", en: "Rivière-des-Prairies-Pointe-aux-Trembles", pop: 114803 },
    { slug: "rosemont-la-petite-patrie", fr: "Rosemont-La Petite-Patrie", en: "Rosemont-La Petite-Patrie", pop: 147945 },
    { slug: "saint-laurent", fr: "Saint-Laurent", en: "Saint-Laurent", pop: 100714 },
    { slug: "saint-leonard", fr: "Saint-Léonard", en: "Saint-Léonard", pop: 82326 },
    { slug: "verdun", fr: "Verdun", en: "Verdun", pop: 72339 },
    { slug: "ville-marie", fr: "Ville-Marie", en: "Ville-Marie", pop: 93137 },
    { slug: "villeray-saint-michel-parc-extension", fr: "Villeray-Saint-Michel-Parc-Extension", en: "Villeray-Saint-Michel-Parc-Extension", pop: 149825 },
  ];

  for (const b of boroughs) {
    insertArea.run(b.slug, "borough", montrealId, b.fr, b.en, null);
    const areaId = getAreaId.get(b.slug)?.id;
    if (areaId) {
      insertAttribute.run(areaId, "population", b.pop, "2021-05-11", "StatsCan 2021 Census");
    }
  }

  // Montreal city-level population
  if (montrealId) {
    insertAttribute.run(montrealId, "population", 1762949, "2021-05-11", "StatsCan 2021 Census");
  }

  // --- Aliases (from normalizeBoroughName map + common dataset variations) ---
  const aliasMap = [
    // CDN-NDG variants
    ["cdnndg", "Côte-des-Neiges—Notre-Dame-de-Grâce", "ckan_permits"],
    ["cdnndg", "CDN-NDG", "ckan_311"],
    // Mercier-Hochelaga-Maisonneuve
    ["mercier-hochelaga-maisonneuve", "Mercier—Hochelaga-Maisonneuve", "ckan_permits"],
    // Plateau variants
    ["plateau-mont-royal", "Plateau-Mont-Royal", "ckan_permits"],
    ["plateau-mont-royal", "Plateau Mont-Royal", "ckan_permits"],
    // Sud-Ouest
    ["le-sud-ouest", "Sud-Ouest", "ckan_permits"],
    // Île-Bizard
    ["ile-bizard-sainte-genevieve", "L'Île-Bizard—Sainte-Geneviève", "ckan_permits"],
    ["ile-bizard-sainte-genevieve", "Île-Bizard—Sainte-Geneviève", "ckan_permits"],
    // RDP-PAT
    ["rdp-pat", "Rivière-des-Prairies—Pointe-aux-Trembles", "ckan_permits"],
    ["rdp-pat", "RDP-PAT", "ckan_311"],
    // Villeray
    ["villeray-saint-michel-parc-extension", "Villeray—Saint-Michel—Parc-Extension", "ckan_permits"],
    // Montréal-Nord accent variant
    ["montreal-nord", "Montreal-Nord", "ckan_permits"],
    // Saint-Léonard accent variant
    ["saint-leonard", "Saint-Leonard", "ckan_permits"],
  ];

  for (const [slug, alias, source] of aliasMap) {
    const areaId = getAreaId.get(slug)?.id;
    if (areaId) {
      insertAlias.run(areaId, alias, source);
    }
  }
});

seed();

console.log("Areas migration complete.");
db.close();
