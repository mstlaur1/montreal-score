-- MontréalScore Database Schema
-- This schema stores processed data from Montreal's open data portal.
-- Raw data is fetched via the CKAN API; this database stores normalized,
-- pre-computed results for fast dashboard queries.

-- Enable PostGIS for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================
-- Boroughs reference table
-- ============================================
CREATE TABLE boroughs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  name_fr TEXT NOT NULL,
  population INTEGER,
  area_km2 NUMERIC(8, 2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Permits (processed from Montreal open data)
-- ============================================
CREATE TABLE permits (
  id SERIAL PRIMARY KEY,
  external_id BIGINT UNIQUE NOT NULL,       -- no_demande from source
  permit_id BIGINT,                          -- id_permis from source
  application_date DATE NOT NULL,            -- date_debut
  issue_date DATE,                           -- date_emission
  processing_days INTEGER,                   -- calculated: issue_date - application_date
  address TEXT,
  borough_id INTEGER REFERENCES boroughs(id),
  borough_raw TEXT,                           -- original arrondissement value
  type_code TEXT NOT NULL,                    -- CO, TR, DE, CA
  type_description TEXT,
  building_type TEXT,
  building_category TEXT,
  work_nature TEXT,
  housing_units INTEGER DEFAULT 0,
  location GEOGRAPHY(POINT, 4326),           -- PostGIS point
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_permits_borough ON permits(borough_id);
CREATE INDEX idx_permits_application_date ON permits(application_date);
CREATE INDEX idx_permits_type_code ON permits(type_code);
CREATE INDEX idx_permits_processing_days ON permits(processing_days);
CREATE INDEX idx_permits_location ON permits USING GIST(location);

-- ============================================
-- Borough permit stats (pre-computed daily)
-- ============================================
CREATE TABLE borough_permit_stats (
  id SERIAL PRIMARY KEY,
  borough_id INTEGER REFERENCES boroughs(id) NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER,                             -- NULL for annual stats
  total_permits INTEGER DEFAULT 0,
  permits_issued INTEGER DEFAULT 0,
  permits_pending INTEGER DEFAULT 0,
  median_processing_days NUMERIC(8, 1),
  avg_processing_days NUMERIC(8, 1),
  p90_processing_days NUMERIC(8, 1),
  pct_within_90_days NUMERIC(5, 2),
  pct_within_120_days NUMERIC(5, 2),
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(borough_id, year, month)
);

CREATE INDEX idx_borough_stats_year ON borough_permit_stats(year);

-- ============================================
-- Borough scores (computed from stats)
-- ============================================
CREATE TABLE borough_scores (
  id SERIAL PRIMARY KEY,
  borough_id INTEGER REFERENCES boroughs(id) NOT NULL,
  period TEXT NOT NULL,                      -- e.g., "2025", "2025-Q4", "2025-12"
  overall_score NUMERIC(5, 1) NOT NULL,
  overall_grade CHAR(1) NOT NULL,
  permits_score NUMERIC(5, 1),
  permits_grade CHAR(1),
  responsiveness_score NUMERIC(5, 1),
  responsiveness_grade CHAR(1),
  infrastructure_score NUMERIC(5, 1),
  infrastructure_grade CHAR(1),
  safety_score NUMERIC(5, 1),
  safety_grade CHAR(1),
  fiscal_score NUMERIC(5, 1),
  fiscal_grade CHAR(1),
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(borough_id, period)
);

-- ============================================
-- 311 Service Requests (for future use)
-- ============================================
CREATE TABLE service_requests (
  id SERIAL PRIMARY KEY,
  external_id TEXT UNIQUE NOT NULL,
  nature TEXT,                               -- info, plainte, requête
  category TEXT,
  subcategory TEXT,
  borough_id INTEGER REFERENCES boroughs(id),
  borough_raw TEXT,
  created_date TIMESTAMPTZ NOT NULL,
  status TEXT,                               -- Acceptee, Annulee, Prise en charge, Refusee, Terminee
  resolved_date TIMESTAMPTZ,
  resolution_days INTEGER,                   -- calculated
  location GEOGRAPHY(POINT, 4326),
  channel TEXT,                              -- how it was submitted
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sr_borough ON service_requests(borough_id);
CREATE INDEX idx_sr_created_date ON service_requests(created_date);
CREATE INDEX idx_sr_category ON service_requests(category);
CREATE INDEX idx_sr_status ON service_requests(status);

-- ============================================
-- Data pipeline tracking
-- ============================================
CREATE TABLE pipeline_runs (
  id SERIAL PRIMARY KEY,
  dataset TEXT NOT NULL,                     -- 'permits', '311', 'snow', etc.
  run_type TEXT NOT NULL,                    -- 'full', 'incremental'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  records_processed INTEGER DEFAULT 0,
  records_inserted INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running',             -- 'running', 'completed', 'failed'
  error_message TEXT
);

-- ============================================
-- Seed boroughs
-- ============================================
INSERT INTO boroughs (name, slug, name_fr) VALUES
  ('Ahuntsic-Cartierville', 'ahuntsic-cartierville', 'Ahuntsic-Cartierville'),
  ('Anjou', 'anjou', 'Anjou'),
  ('Côte-des-Neiges-Notre-Dame-de-Grâce', 'cdnndg', 'Côte-des-Neiges-Notre-Dame-de-Grâce'),
  ('Lachine', 'lachine', 'Lachine'),
  ('LaSalle', 'lasalle', 'LaSalle'),
  ('Le Plateau-Mont-Royal', 'plateau-mont-royal', 'Le Plateau-Mont-Royal'),
  ('Le Sud-Ouest', 'le-sud-ouest', 'Le Sud-Ouest'),
  ('L''Île-Bizard-Sainte-Geneviève', 'ile-bizard-sainte-genevieve', 'L''Île-Bizard-Sainte-Geneviève'),
  ('Mercier-Hochelaga-Maisonneuve', 'mercier-hochelaga-maisonneuve', 'Mercier-Hochelaga-Maisonneuve'),
  ('Montréal-Nord', 'montreal-nord', 'Montréal-Nord'),
  ('Outremont', 'outremont', 'Outremont'),
  ('Pierrefonds-Roxboro', 'pierrefonds-roxboro', 'Pierrefonds-Roxboro'),
  ('Rivière-des-Prairies-Pointe-aux-Trembles', 'rdp-pat', 'Rivière-des-Prairies-Pointe-aux-Trembles'),
  ('Rosemont-La Petite-Patrie', 'rosemont-la-petite-patrie', 'Rosemont-La Petite-Patrie'),
  ('Saint-Laurent', 'saint-laurent', 'Saint-Laurent'),
  ('Saint-Léonard', 'saint-leonard', 'Saint-Léonard'),
  ('Verdun', 'verdun', 'Verdun'),
  ('Ville-Marie', 'ville-marie', 'Ville-Marie'),
  ('Villeray-Saint-Michel-Parc-Extension', 'villeray-saint-michel-parc-extension', 'Villeray-Saint-Michel-Parc-Extension')
ON CONFLICT (slug) DO NOTHING;
