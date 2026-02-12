/**
 * Standalone local admin for the Promise Tracker.
 * Serves an HTML admin UI + REST API on http://localhost:3001
 *
 * Usage:
 *   npm run admin
 */

import Database from "better-sqlite3";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync, statSync, existsSync, copyFileSync, unlinkSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.join(__dirname, "..");
const DB_PATH = path.join(PROJECT_DIR, "data", "montreal-dev.db");
const PROD_DB_PATH = path.join(PROJECT_DIR, "data", "montreal.db");
const PORT = Number(process.env.PORT) || 3099;
const CF_TOKEN_FILE = path.join(
  process.env.HOME || "/root",
  ".config/cloudflare/api_token"
);
const CF_ZONE_ID = "7c80804534f0718cb0646311fa746505";

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// ---- API: list promises with latest update --------------------------------

app.get("/api/promises", (_req, res) => {
  const rows = db
    .prepare(
      `
      SELECT p.*,
        pu.date        AS latest_date,
        pu.sentiment   AS latest_sentiment,
        pu.summary_en  AS latest_summary_en,
        pu.summary_fr  AS latest_summary_fr
      FROM promises p
      LEFT JOIN promise_updates pu ON pu.promise_id = p.id
        AND pu.id = (
          SELECT id FROM promise_updates
          WHERE promise_id = p.id
          ORDER BY date DESC, id DESC
          LIMIT 1
        )
      ORDER BY p.category, p.id
      `
    )
    .all();
  res.json(rows);
});

// ---- API: single promise + all updates ------------------------------------

app.get("/api/promises/:id", (req, res) => {
  const promise = db
    .prepare("SELECT * FROM promises WHERE id = ?")
    .get(req.params.id);
  if (!promise) return res.status(404).json({ error: "Not found" });

  const updates = db
    .prepare(
      "SELECT * FROM promise_updates WHERE promise_id = ? ORDER BY date DESC"
    )
    .all(req.params.id);

  res.json({ promise, updates });
});

// ---- API: update promise status -------------------------------------------

app.patch("/api/promises/:id", (req, res) => {
  const { status } = req.body;
  const allowed = [
    "not_started",
    "in_progress",
    "completed",
    "broken",
    "partially_met",
  ];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Use: ${allowed.join(", ")}` });
  }
  const result = db
    .prepare(
      "UPDATE promises SET status = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// ---- API: add update ------------------------------------------------------

app.post("/api/promises/:id/updates", (req, res) => {
  const { date, source_url, source_title, summary_fr, summary_en, sentiment } =
    req.body;
  if (!date) return res.status(400).json({ error: "date is required" });

  const result = db
    .prepare(
      `INSERT INTO promise_updates (promise_id, date, source_url, source_title, summary_fr, summary_en, sentiment)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.params.id,
      date,
      source_url ?? null,
      source_title ?? null,
      summary_fr ?? null,
      summary_en ?? null,
      sentiment ?? null
    );
  res.json({ ok: true, id: result.lastInsertRowid });
});

// ---- API: edit update -----------------------------------------------------

app.patch("/api/updates/:id", (req, res) => {
  const { date, source_url, source_title, summary_fr, summary_en, sentiment } =
    req.body;
  const result = db
    .prepare(
      `UPDATE promise_updates
       SET date = coalesce(?, date),
           source_url = ?,
           source_title = ?,
           summary_fr = ?,
           summary_en = ?,
           sentiment = ?
       WHERE id = ?`
    )
    .run(
      date ?? null,
      source_url ?? null,
      source_title ?? null,
      summary_fr ?? null,
      summary_en ?? null,
      sentiment ?? null,
      req.params.id
    );
  if (result.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// ---- API: delete update ---------------------------------------------------

app.delete("/api/updates/:id", (req, res) => {
  const result = db
    .prepare("DELETE FROM promise_updates WHERE id = ?")
    .run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// ---- API: deploy to live ---------------------------------------------------

let deploying = false;

app.post("/api/deploy", async (_req, res) => {
  const result = await runDeploy();
  if (result.ok) {
    res.json(result);
  } else {
    res.status(result.error === "Deploy already in progress" ? 409 : 500).json(result);
  }
});

// ---------------------------------------------------------------------------
// Database management
// ---------------------------------------------------------------------------

const SCHEDULE_FILE = path.join(PROJECT_DIR, "data", "admin-schedules.json");
const DEV_DB_FILE = "montreal-dev.db";

interface DatasetConfig {
  label: string;
  command: string[];
  fullFlag: string;
  tables: Record<string, string | null>; // table -> MAX date column or null
  etlDatasets: string[];                 // names in etl_runs table
  postMigrations: string[];
  purgeSQL: string[];
}

const DATASETS: Record<string, DatasetConfig> = {
  "permits-contracts": {
    label: "Permits & Contracts",
    command: ["npx", "tsx", "scripts/etl.ts"],
    fullFlag: "--full",
    tables: { permits: "date_debut", contracts: "approval_date" },
    etlDatasets: ["permits", "contracts"],
    postMigrations: [
      "scripts/migrations/add-processing-days.js",
      "scripts/migrations/build-fts.js",
      "scripts/migrations/cache-permit-trends.js",
    ],
    purgeSQL: [
      "DELETE FROM permits",
      "DELETE FROM contracts",
      "DROP TABLE IF EXISTS contracts_fts",
    ],
  },
  "311": {
    label: "311 Service Requests",
    command: ["npx", "tsx", "scripts/etl-311.ts"],
    fullFlag: "--full",
    tables: { sr_monthly: "year_month", sr_borough: null, sr_category: null, sr_channel: null, sr_status: null, sr_pothole: null },
    etlDatasets: ["311"],
    postMigrations: [],
    purgeSQL: [
      "DELETE FROM sr_monthly",
      "DELETE FROM sr_borough",
      "DELETE FROM sr_category",
      "DELETE FROM sr_channel",
      "DELETE FROM sr_status",
      "DELETE FROM sr_pothole",
    ],
  },
  promises: {
    label: "Promises",
    command: ["npx", "tsx", "scripts/seed-promises.ts"],
    fullFlag: "",
    tables: { promises: "updated_at", promise_updates: null },
    etlDatasets: ["promises"],
    postMigrations: [],
    purgeSQL: [
      "DELETE FROM promise_updates",
      "DELETE FROM promises",
    ],
  },
};

// --- ETL process tracking ---
interface EtlProcess {
  proc: ChildProcess | null;
  logs: string[];
  running: boolean;
  startedAt: number;
}
const etlProcesses: Record<string, EtlProcess> = {};

// --- Schedule persistence ---
interface ScheduleEntry { interval: number; autoPublish: boolean; }
let schedules: Record<string, ScheduleEntry> = {};
const scheduleTimers: Record<string, ReturnType<typeof setInterval>> = {};

function loadSchedules() {
  try {
    if (existsSync(SCHEDULE_FILE)) {
      schedules = JSON.parse(readFileSync(SCHEDULE_FILE, "utf-8"));
    }
  } catch { /* ignore corrupt file */ }
  // Ensure all datasets have entries
  for (const id of Object.keys(DATASETS)) {
    if (!schedules[id]) schedules[id] = { interval: 0, autoPublish: false };
  }
}

function saveSchedules() {
  writeFileSync(SCHEDULE_FILE, JSON.stringify(schedules, null, 2));
}

function setupScheduleTimer(datasetId: string) {
  if (scheduleTimers[datasetId]) {
    clearInterval(scheduleTimers[datasetId]);
    delete scheduleTimers[datasetId];
  }
  const entry = schedules[datasetId];
  if (entry && entry.interval > 0) {
    scheduleTimers[datasetId] = setInterval(() => {
      if (!etlProcesses[datasetId]?.running) {
        runEtl(datasetId, false);
      }
    }, entry.interval);
  }
}

loadSchedules();
for (const id of Object.keys(DATASETS)) setupScheduleTimer(id);

// --- Deploy helper (reused by auto-publish) ---
async function runDeploy(): Promise<{ ok: boolean; duration: string; error?: string; step?: string }> {
  if (deploying) return { ok: false, duration: "0s", error: "Deploy already in progress" };
  deploying = true;
  const t0 = Date.now();
  let currentStep = "";
  try {
    currentStep = "stop-server";
    execSync("sudo systemctl stop montreal-score", { stdio: "pipe", timeout: 15_000 });
    currentStep = "copy-db";
    db.pragma("wal_checkpoint(TRUNCATE)");
    // Remove stale WAL/SHM from prod before overwriting — prevents corruption
    try { unlinkSync(PROD_DB_PATH + "-wal"); } catch {}
    try { unlinkSync(PROD_DB_PATH + "-shm"); } catch {}
    copyFileSync(DB_PATH, PROD_DB_PATH);
    currentStep = "rebuild-caches";
    execSync(`node scripts/migrations/build-fts.js`, { cwd: PROJECT_DIR, stdio: "pipe", timeout: 60_000 });
    execSync(`node scripts/migrations/cache-permit-trends.js`, { cwd: PROJECT_DIR, stdio: "pipe", timeout: 60_000 });
    currentStep = "build";
    execSync("npm run build", { cwd: PROJECT_DIR, stdio: "pipe", timeout: 120_000 });
    currentStep = "symlink";
    const standalone = path.join(PROJECT_DIR, ".next/standalone");
    execSync(`ln -sf "${PROJECT_DIR}/.next/static" "${standalone}/.next/static"`, { stdio: "pipe" });
    execSync(`ln -sf "${PROJECT_DIR}/public" "${standalone}/public"`, { stdio: "pipe" });
    execSync(`ln -sf "${PROJECT_DIR}/messages" "${standalone}/messages"`, { stdio: "pipe" });
    execSync(`rm -rf "${standalone}/data" && ln -sf "${PROJECT_DIR}/data" "${standalone}/data"`, { stdio: "pipe" });
    currentStep = "restart";
    execSync("sudo systemctl start montreal-score", { stdio: "pipe", timeout: 15_000 });
    currentStep = "purge";
    const cfToken = readFileSync(CF_TOKEN_FILE, "utf-8").trim();
    const purgeRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ hosts: ["montrealscore.ashwater.ca"] }),
    });
    const purgeData = await purgeRes.json();
    if (!purgeData.success) throw new Error("CF purge failed: " + JSON.stringify(purgeData.errors));
    return { ok: true, duration: Math.round((Date.now() - t0) / 1000) + "s" };
  } catch (err: any) {
    return { ok: false, duration: Math.round((Date.now() - t0) / 1000) + "s", error: err.message, step: currentStep };
  } finally {
    deploying = false;
  }
}

// --- ETL runner ---
function runEtl(datasetId: string, fullMode: boolean) {
  const config = DATASETS[datasetId];
  if (!config) return;
  if (etlProcesses[datasetId]?.running) return;

  const args = [...config.command.slice(1)];
  if (fullMode && config.fullFlag) args.push(config.fullFlag);
  const env = { ...process.env, DB_FILE: DEV_DB_FILE };

  const proc = spawn(config.command[0], args, { cwd: PROJECT_DIR, env, stdio: ["ignore", "pipe", "pipe"] });
  const entry: EtlProcess = { proc, logs: [], running: true, startedAt: Date.now() };
  etlProcesses[datasetId] = entry;

  const addLog = (line: string) => {
    entry.logs.push(line);
    if (entry.logs.length > 2000) entry.logs.shift();
  };

  addLog(`$ ${config.command.join(" ")}${fullMode && config.fullFlag ? " " + config.fullFlag : ""}`);
  addLog(`  DB_FILE=${DEV_DB_FILE}  started at ${new Date().toLocaleTimeString()}`);
  addLog("");

  proc.stdout?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) {
      if (line) addLog(line);
    }
  });
  proc.stderr?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) {
      if (line) addLog("[stderr] " + line);
    }
  });

  proc.on("close", async (code) => {
    entry.running = false;
    entry.proc = null;
    const elapsed = Math.round((Date.now() - entry.startedAt) / 1000);
    if (code === 0) {
      addLog("");
      addLog(`ETL completed successfully in ${elapsed}s`);
      // Run post-migrations
      for (const migration of config.postMigrations) {
        addLog(`Running ${migration}...`);
        try {
          execSync(`node ${migration}`, { cwd: PROJECT_DIR, env, stdio: "pipe", timeout: 120_000 });
          addLog(`  done.`);
        } catch (err: any) {
          addLog(`  FAILED: ${err.message}`);
        }
      }
      // Auto-publish if enabled
      if (schedules[datasetId]?.autoPublish) {
        addLog("");
        addLog("Auto-publishing to live...");
        const result = await runDeploy();
        if (result.ok) {
          addLog(`Published to live in ${result.duration}`);
        } else {
          addLog(`Deploy FAILED at ${result.step}: ${result.error}`);
        }
      }
    } else {
      addLog("");
      addLog(`ETL FAILED with exit code ${code} after ${elapsed}s`);
    }
  });
}

// ---- API: database stats ---------------------------------------------------

app.get("/api/databases", (_req, res) => {
  const dbSize = existsSync(DB_PATH) ? statSync(DB_PATH).size : 0;
  const datasets: Record<string, any> = {};

  for (const [id, config] of Object.entries(DATASETS)) {
    const tables: Record<string, any> = {};
    for (const [table, dateCol] of Object.entries(config.tables)) {
      try {
        const countRow = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as any;
        let latestDate: string | null = null;
        if (dateCol) {
          const dateRow = db.prepare(`SELECT MAX(${dateCol}) AS d FROM ${table}`).get() as any;
          latestDate = dateRow?.d ?? null;
        }
        tables[table] = { rows: countRow?.n ?? 0, latestDate };
      } catch {
        tables[table] = { rows: 0, latestDate: null };
      }
    }

    // Last ETL run
    let lastEtlRun: any = null;
    for (const ds of config.etlDatasets) {
      try {
        const row = db.prepare(
          `SELECT finished_at, mode, rows_loaded FROM etl_runs WHERE dataset = ? AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 1`
        ).get(ds) as any;
        if (row && (!lastEtlRun || row.finished_at > lastEtlRun.finishedAt)) {
          lastEtlRun = { finishedAt: row.finished_at, mode: row.mode, rowsLoaded: row.rows_loaded };
        }
      } catch { /* table might not exist */ }
    }

    datasets[id] = {
      tables,
      lastEtlRun,
      running: !!etlProcesses[id]?.running,
      schedule: schedules[id] || { interval: 0, autoPublish: false },
    };
  }

  // FTS check
  let hasFts = false;
  try {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contracts_fts'").get();
    hasFts = !!row;
  } catch {}

  res.json({ dbSizeBytes: dbSize, hasFts, datasets });
});

// ---- API: trigger ETL ------------------------------------------------------

app.post("/api/databases/:id/update", (req, res) => {
  const id = req.params.id;
  if (!DATASETS[id]) return res.status(404).json({ error: "Unknown dataset" });
  if (etlProcesses[id]?.running) return res.status(409).json({ error: "ETL already running" });

  const fullMode = req.query.mode === "full";
  runEtl(id, fullMode);
  res.json({ ok: true, mode: fullMode ? "full" : "incremental" });
});

// ---- API: SSE log stream ---------------------------------------------------

app.get("/api/databases/:id/logs", (req, res) => {
  const id = req.params.id;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let lastSent = 0;
  const interval = setInterval(() => {
    const entry = etlProcesses[id];
    if (!entry) { res.write("data: \n\n"); return; }
    const newLines = entry.logs.slice(lastSent);
    for (const line of newLines) {
      res.write(`data: ${JSON.stringify(line)}\n\n`);
    }
    lastSent = entry.logs.length;
    // Send running status
    res.write(`event: status\ndata: ${JSON.stringify({ running: entry.running })}\n\n`);
  }, 500);

  req.on("close", () => clearInterval(interval));
});

// ---- API: schedule ---------------------------------------------------------

app.post("/api/databases/:id/schedule", (req, res) => {
  const id = req.params.id;
  if (!DATASETS[id]) return res.status(404).json({ error: "Unknown dataset" });

  const { interval, autoPublish } = req.body;
  if (typeof interval !== "number" || interval < 0) {
    return res.status(400).json({ error: "interval must be a non-negative number (ms)" });
  }
  schedules[id] = { interval, autoPublish: !!autoPublish };
  saveSchedules();
  setupScheduleTimer(id);
  res.json({ ok: true });
});

// ---- API: purge dataset ----------------------------------------------------

app.post("/api/databases/:id/purge", (req, res) => {
  const id = req.params.id;
  const config = DATASETS[id];
  if (!config) return res.status(404).json({ error: "Unknown dataset" });
  if (req.body.confirm !== id) {
    return res.status(400).json({ error: `Must send { confirm: "${id}" } to confirm` });
  }
  if (etlProcesses[id]?.running) {
    return res.status(409).json({ error: "Cannot purge while ETL is running" });
  }

  try {
    for (const sql of config.purgeSQL) {
      db.exec(sql);
    }
    db.exec("VACUUM");
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- API: purge all --------------------------------------------------------

app.post("/api/databases/purge-all", (req, res) => {
  if (req.body.confirm !== "all") {
    return res.status(400).json({ error: 'Must send { confirm: "all" } to confirm' });
  }
  for (const [id, entry] of Object.entries(etlProcesses)) {
    if (entry.running) return res.status(409).json({ error: `Cannot purge: ${id} ETL is running` });
  }

  try {
    for (const config of Object.values(DATASETS)) {
      for (const sql of config.purgeSQL) {
        db.exec(sql);
      }
    }
    db.exec("VACUUM");
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- HTML UI --------------------------------------------------------------

app.get("/", (_req, res) => {
  res.type("html").send(HTML);
});

// ---------------------------------------------------------------------------
// Embedded HTML
// ---------------------------------------------------------------------------

const HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Promise Tracker Admin</title>
<style>
  :root {
    --bg: #111; --surface: #1a1a1a; --border: #333; --text: #e5e5e5;
    --muted: #888; --accent: #60a5fa; --danger: #ef4444;
    --green: #22c55e; --yellow: #eab308; --red: #ef4444; --blue: #3b82f6; --purple: #a855f7;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
  a { color: var(--accent); }

  .container { max-width: 1100px; margin: 0 auto; padding: 1rem; }

  header { display: flex; align-items: center; gap: 1rem; padding: 1rem 0; border-bottom: 1px solid var(--border); margin-bottom: 1rem; }
  header h1 { font-size: 1.25rem; font-weight: 600; }
  header .stats { color: var(--muted); font-size: 0.85rem; margin-left: auto; }
  .btn-deploy {
    background: transparent; color: var(--green); border: 1px solid var(--green);
    padding: 0.35rem 0.8rem; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 500;
    white-space: nowrap;
  }
  .btn-deploy:hover { background: #14532d; }
  .btn-deploy:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Filters bar */
  .filters { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .filters input, .filters select {
    background: var(--surface); border: 1px solid var(--border); color: var(--text);
    padding: 0.4rem 0.6rem; border-radius: 6px; font-size: 0.85rem;
  }
  .filters input { flex: 1; min-width: 200px; }

  /* Promise table */
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th { text-align: left; padding: 0.5rem; border-bottom: 2px solid var(--border); color: var(--muted); font-weight: 500; user-select: none; }
  th.sortable { cursor: pointer; }
  th.sortable:hover { color: var(--text); }
  td { padding: 0.5rem; border-bottom: 1px solid var(--border); vertical-align: top; }
  tr.clickable { cursor: pointer; }
  tr.clickable:hover { background: var(--surface); }
  tr.selected { background: #1e293b; }

  /* Status badge */
  .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; }
  .badge-not_started { background: #374151; color: #9ca3af; }
  .badge-in_progress { background: #1e3a5f; color: var(--blue); }
  .badge-completed { background: #14532d; color: var(--green); }
  .badge-broken { background: #450a0a; color: var(--red); }
  .badge-partially_met { background: #422006; color: var(--yellow); }

  /* Sentiment badge */
  .sentiment { font-size: 0.75rem; }
  .sentiment-positive { color: var(--green); }
  .sentiment-negative { color: var(--red); }
  .sentiment-neutral { color: var(--muted); }
  .sentiment-mixed { color: var(--yellow); }

  /* Detail panel */
  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .panel h2 { font-size: 1rem; margin-bottom: 0.75rem; }
  .panel-meta { display: flex; gap: 1rem; flex-wrap: wrap; color: var(--muted); font-size: 0.8rem; margin-bottom: 1rem; }

  /* Status buttons */
  .status-btns { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .status-btns button {
    padding: 0.3rem 0.7rem; border-radius: 6px; border: 1px solid var(--border);
    background: var(--surface); color: var(--text); cursor: pointer; font-size: 0.8rem;
  }
  .status-btns button:hover { border-color: var(--accent); }
  .status-btns button.active { border-color: var(--accent); background: #1e3a5f; }

  /* Update form */
  .update-form { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 1rem; }
  .update-form label { font-size: 0.8rem; color: var(--muted); display: block; margin-bottom: 0.15rem; }
  .update-form input, .update-form select, .update-form textarea {
    width: 100%; background: var(--bg); border: 1px solid var(--border); color: var(--text);
    padding: 0.35rem 0.5rem; border-radius: 4px; font-size: 0.85rem; font-family: inherit;
  }
  .update-form textarea { resize: vertical; min-height: 60px; }
  .update-form .full { grid-column: 1 / -1; }
  .update-form .actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; }
  .btn-primary {
    background: var(--accent); color: #000; border: none; padding: 0.4rem 1rem;
    border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 500;
  }
  .btn-primary:hover { opacity: 0.9; }
  .btn-danger {
    background: transparent; color: var(--danger); border: 1px solid var(--danger);
    padding: 0.2rem 0.5rem; border-radius: 4px; cursor: pointer; font-size: 0.75rem;
  }
  .btn-danger:hover { background: #450a0a; }
  .btn-edit {
    background: transparent; color: var(--accent); border: 1px solid var(--accent);
    padding: 0.2rem 0.5rem; border-radius: 4px; cursor: pointer; font-size: 0.75rem;
  }
  .btn-edit:hover { background: #1e3a5f; }
  .btn-cancel {
    background: transparent; color: var(--muted); border: 1px solid var(--border);
    padding: 0.4rem 1rem; border-radius: 6px; cursor: pointer; font-size: 0.85rem;
  }
  .btn-cancel:hover { border-color: var(--muted); }

  /* Existing updates */
  .update-card { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem; margin-bottom: 0.5rem; }
  .update-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem; }
  .update-card-date { font-weight: 500; font-size: 0.85rem; }
  .update-card p { font-size: 0.8rem; color: var(--muted); margin-top: 0.2rem; }

  .toast { position: fixed; bottom: 1rem; right: 1rem; background: var(--green); color: #000; padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.85rem; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
  .toast.show { opacity: 1; }

  .empty { text-align: center; color: var(--muted); padding: 3rem 0; }
  .back-link { cursor: pointer; color: var(--accent); font-size: 0.85rem; margin-bottom: 0.75rem; display: inline-block; }

  /* Tabs */
  .tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 1rem; }
  .tab {
    padding: 0.5rem 1.2rem; cursor: pointer; font-size: 0.85rem; font-weight: 500;
    color: var(--muted); border-bottom: 2px solid transparent; transition: all 0.15s;
    background: none; border-top: none; border-left: none; border-right: none;
  }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }

  /* DB stats bar */
  .db-stats-bar { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem 1rem; margin-bottom: 1rem; font-size: 0.8rem; color: var(--muted); display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: center; }
  .db-stats-bar .stat-value { color: var(--text); font-weight: 500; }
  .db-stats-bar .stat-ok { color: var(--green); }
  .db-stats-bar .stat-warn { color: var(--yellow); }

  /* Dataset card */
  .ds-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; }
  .ds-card h3 { font-size: 0.95rem; font-weight: 600; margin-bottom: 0.6rem; }
  .ds-card-tables { display: flex; gap: 1.5rem; flex-wrap: wrap; font-size: 0.8rem; color: var(--muted); margin-bottom: 0.6rem; }
  .ds-card-tables .tbl { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 0.3rem 0.6rem; }
  .ds-card-tables .tbl-name { color: var(--accent); font-weight: 500; }
  .ds-card-tables .tbl-stat { margin-left: 0.4rem; }
  .ds-card-meta { font-size: 0.8rem; color: var(--muted); margin-bottom: 0.6rem; }
  .ds-card-actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .ds-card-actions .schedule-group { display: flex; gap: 0.4rem; align-items: center; margin-left: auto; }
  .ds-card-actions select {
    background: var(--bg); border: 1px solid var(--border); color: var(--text);
    padding: 0.25rem 0.4rem; border-radius: 4px; font-size: 0.8rem;
  }
  .ds-card-actions label { font-size: 0.8rem; color: var(--muted); cursor: pointer; display: flex; align-items: center; gap: 0.25rem; }
  .ds-running { color: var(--yellow); font-size: 0.8rem; font-weight: 500; }
  .btn-sm {
    padding: 0.3rem 0.7rem; border-radius: 6px; border: 1px solid var(--border);
    background: var(--surface); color: var(--text); cursor: pointer; font-size: 0.8rem;
  }
  .btn-sm:hover { border-color: var(--accent); }
  .btn-sm:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-sm-accent { border-color: var(--accent); color: var(--accent); }
  .btn-sm-accent:hover { background: #1e3a5f; }

  /* Terminal */
  .terminal { background: #0a0a0a; border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem; margin-bottom: 1rem; max-height: 300px; overflow-y: auto; }
  .terminal pre { font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace; font-size: 0.75rem; color: #a3e635; white-space: pre-wrap; word-break: break-all; line-height: 1.4; margin: 0; }
  .terminal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .terminal-header h3 { font-size: 0.9rem; }
  .terminal-header button { font-size: 0.75rem; }

  /* Danger zone */
  .danger-zone { border: 1px solid #7f1d1d; border-radius: 8px; padding: 1rem; margin-top: 1rem; }
  .danger-zone h3 { color: var(--danger); font-size: 0.9rem; margin-bottom: 0.75rem; }
  .danger-zone .danger-btns { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .btn-danger-lg {
    background: transparent; color: var(--danger); border: 1px solid var(--danger);
    padding: 0.35rem 0.8rem; border-radius: 6px; cursor: pointer; font-size: 0.8rem;
  }
  .btn-danger-lg:hover { background: #450a0a; }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>Promise Tracker Admin</h1>
    <div class="stats" id="stats"></div>
    <button class="btn-deploy" id="deployBtn" onclick="deployToLive()">Publish to Live</button>
  </header>
  <div class="tabs">
    <button class="tab active" id="tabPromises" onclick="switchTab('promises')">Promises</button>
    <button class="tab" id="tabDatabases" onclick="switchTab('databases')">Databases</button>
  </div>

  <div id="app"></div>
  <div class="toast" id="toast"></div>
</div>

<script>
// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentPage = 'promises'; // 'promises' | 'databases'
let promises = [];
let selectedId = null;
let detail = null; // { promise, updates }
let searchTerm = '';
let filterStatus = '';
let filterCategory = '';
let filterBorough = '';
let sortCol = 'id';    // 'id' | 'text' | 'category' | 'status' | 'latest'
let sortDir = 'asc';   // 'asc' | 'desc'
let dbData = null;       // response from /api/databases
let activeLogSource = null; // EventSource for SSE
let activeLogDataset = null;
let terminalLogs = [];

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return res.json();
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
async function loadPromises() {
  promises = await api('/api/promises');
  updateStats();
  render();
}

async function loadDetail(id) {
  detail = await api('/api/promises/' + encodeURIComponent(id));
  render();
}

function updateStats() {
  const counts = {};
  for (const p of promises) counts[p.status] = (counts[p.status] || 0) + 1;
  const parts = [];
  for (const [s, n] of Object.entries(counts)) parts.push(n + ' ' + s.replace(/_/g, ' '));
  document.getElementById('stats').textContent = promises.length + ' promises — ' + parts.join(', ');
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------
function getCategories() {
  return [...new Set(promises.map(p => p.category))].sort();
}
function getBoroughs() {
  return [...new Set(promises.map(p => p.borough).filter(Boolean))].sort();
}
function filtered() {
  const result = promises.filter(p => {
    if (searchTerm && !p.text_en.toLowerCase().includes(searchTerm.toLowerCase())
      && !p.text_fr.toLowerCase().includes(searchTerm.toLowerCase())
      && !p.id.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterStatus && p.status !== filterStatus) return false;
    if (filterCategory && p.category !== filterCategory) return false;
    if (filterBorough && (p.borough || '') !== filterBorough) return false;
    return true;
  });
  const dir = sortDir === 'asc' ? 1 : -1;
  result.sort((a, b) => {
    let va, vb;
    if (sortCol === 'id') { va = a.id; vb = b.id; }
    else if (sortCol === 'text') { va = a.text_en; vb = b.text_en; }
    else if (sortCol === 'category') { va = a.category; vb = b.category; }
    else if (sortCol === 'status') { va = a.status; vb = b.status; }
    else if (sortCol === 'latest') { va = a.latest_date || ''; vb = b.latest_date || ''; }
    else { va = a.id; vb = b.id; }
    return va < vb ? -dir : va > vb ? dir : 0;
  });
  return result;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render() {
  const app = document.getElementById('app');
  if (currentPage === 'databases') {
    app.innerHTML = renderDatabases();
    bindDatabasesEvents();
  } else if (selectedId && detail) {
    app.innerHTML = renderDetail();
    bindDetailEvents();
  } else {
    app.innerHTML = renderList();
    bindListEvents();
  }
}

function switchTab(tab) {
  currentPage = tab;
  document.getElementById('tabPromises').classList.toggle('active', tab === 'promises');
  document.getElementById('tabDatabases').classList.toggle('active', tab === 'databases');
  if (tab === 'databases' && !dbData) loadDatabases();
  else render();
}

async function loadDatabases() {
  dbData = await api('/api/databases');
  render();
}

function badgeHtml(status) {
  return '<span class="badge badge-' + status + '">' + status.replace(/_/g, ' ') + '</span>';
}

function sentimentHtml(s) {
  if (!s) return '';
  return '<span class="sentiment sentiment-' + s + '">' + s + '</span>';
}

// ---- List view ------------------------------------------------------------

function renderList() {
  const rows = filtered();
  const cats = getCategories();
  const boros = getBoroughs();

  let html = '<div class="filters">';
  html += '<input type="text" id="search" placeholder="Search promises..." value="' + esc(searchTerm) + '">';
  html += '<select id="filterStatus"><option value="">All statuses</option>';
  for (const s of ['not_started','in_progress','completed','broken','partially_met']) {
    html += '<option value="' + s + '"' + (filterStatus === s ? ' selected' : '') + '>' + s.replace(/_/g, ' ') + '</option>';
  }
  html += '</select>';
  html += '<select id="filterCategory"><option value="">All categories</option>';
  for (const c of cats) html += '<option value="' + esc(c) + '"' + (filterCategory === c ? ' selected' : '') + '>' + esc(c) + '</option>';
  html += '</select>';
  if (boros.length) {
    html += '<select id="filterBorough"><option value="">All boroughs</option>';
    for (const b of boros) html += '<option value="' + esc(b) + '"' + (filterBorough === b ? ' selected' : '') + '>' + esc(b) + '</option>';
    html += '</select>';
  }
  html += '</div>';

  if (!rows.length) {
    html += '<div class="empty">No promises match your filters.</div>';
    return html;
  }

  function thSort(col, label) {
    const arrow = sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    return '<th class="sortable" data-sort="' + col + '">' + label + arrow + '</th>';
  }
  html += '<table><thead><tr>' + thSort('id','ID') + thSort('text','Promise') + thSort('category','Category') + thSort('status','Status') + thSort('latest','Latest') + '</tr></thead><tbody>';
  for (const p of rows) {
    html += '<tr class="clickable" data-id="' + esc(p.id) + '">';
    html += '<td style="white-space:nowrap">' + esc(p.id) + '</td>';
    html += '<td>' + esc(p.text_en) + '</td>';
    html += '<td style="white-space:nowrap">' + esc(p.category) + '</td>';
    html += '<td>' + badgeHtml(p.status) + '</td>';
    html += '<td>' + (p.latest_date ? esc(p.latest_date) + ' ' + sentimentHtml(p.latest_sentiment) : '<span style="color:var(--muted)">—</span>') + '</td>';
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

function deferRender() { setTimeout(render, 0); }

function bindListEvents() {
  const searchEl = document.getElementById('search');
  searchEl?.addEventListener('input', e => {
    searchTerm = e.target.value;
    const pos = e.target.selectionStart;
    // Defer render to avoid Safari crash when innerHTML replaces the active element
    setTimeout(() => {
      render();
      const el = document.getElementById('search');
      if (el) { el.focus(); el.selectionStart = el.selectionEnd = pos; }
    }, 0);
  });
  document.getElementById('filterStatus')?.addEventListener('change', e => { filterStatus = e.target.value; deferRender(); });
  document.getElementById('filterCategory')?.addEventListener('change', e => { filterCategory = e.target.value; deferRender(); });
  document.getElementById('filterBorough')?.addEventListener('change', e => { filterBorough = e.target.value; deferRender(); });
  for (const th of document.querySelectorAll('th.sortable')) {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortCol === col) { sortDir = sortDir === 'asc' ? 'desc' : 'asc'; }
      else { sortCol = col; sortDir = 'asc'; }
      deferRender();
    });
  }
  for (const tr of document.querySelectorAll('tr.clickable')) {
    tr.addEventListener('click', () => { selectedId = tr.dataset.id; loadDetail(selectedId); });
  }
}

// ---- Detail view ----------------------------------------------------------

function renderDetail() {
  const p = detail.promise;
  const updates = detail.updates;

  let html = '<span class="back-link" id="backBtn">&larr; Back to list</span>';
  html += '<div class="panel">';
  html += '<h2>' + esc(p.text_en) + '</h2>';
  html += '<p style="color:var(--muted);font-size:0.85rem;margin-bottom:0.75rem">' + esc(p.text_fr) + '</p>';
  html += '<div class="panel-meta">';
  html += '<span>ID: ' + esc(p.id) + '</span>';
  html += '<span>Category: ' + esc(p.category) + '</span>';
  if (p.subcategory) html += '<span>Sub: ' + esc(p.subcategory) + '</span>';
  if (p.borough) html += '<span>Borough: ' + esc(p.borough) + '</span>';
  if (p.target_timeline) html += '<span>Timeline: ' + esc(p.target_timeline) + '</span>';
  if (p.target_value) html += '<span>Target: ' + esc(p.target_value) + '</span>';
  html += '<span>Measurable: ' + (p.measurable ? 'Yes' : 'No') + '</span>';
  html += '<span>First 100 days: ' + (p.first_100_days ? 'Yes' : 'No') + '</span>';
  html += '</div>';

  // Status buttons
  html += '<div style="margin-bottom:0.5rem;font-size:0.8rem;color:var(--muted)">Status</div>';
  html += '<div class="status-btns">';
  for (const s of ['not_started','in_progress','completed','broken','partially_met']) {
    html += '<button data-status="' + s + '"' + (p.status === s ? ' class="active"' : '') + '>' + s.replace(/_/g, ' ') + '</button>';
  }
  html += '</div>';
  html += '</div>';

  // Add update form
  html += '<div class="panel">';
  html += '<h2>Add Update</h2>';
  html += '<div class="update-form">';
  html += '<div><label>Date *</label><input type="date" id="upDate" value="' + new Date().toISOString().slice(0, 10) + '"></div>';
  html += '<div><label>Sentiment</label><select id="upSentiment"><option value="">—</option><option value="positive">positive</option><option value="negative">negative</option><option value="neutral">neutral</option><option value="mixed">mixed</option></select></div>';
  html += '<div><label>Source URL</label><input type="url" id="upUrl" placeholder="https://..."></div>';
  html += '<div><label>Source Title</label><input type="text" id="upTitle"></div>';
  html += '<div class="full"><label>Summary (FR)</label><textarea id="upFr" placeholder="Résumé en français..."></textarea></div>';
  html += '<div class="full"><label>Summary (EN)</label><textarea id="upEn" placeholder="English summary..."></textarea></div>';
  html += '<div class="actions"><button class="btn-primary" id="addUpdateBtn">Add Update</button></div>';
  html += '</div></div>';

  // Existing updates
  if (updates.length) {
    html += '<div class="panel"><h2>Updates (' + updates.length + ')</h2>';
    for (const u of updates) {
      html += '<div class="update-card" id="update-card-' + u.id + '">';
      html += '<div class="update-card-header">';
      html += '<span class="update-card-date">' + esc(u.date) + ' ' + sentimentHtml(u.sentiment) + '</span>';
      html += '<div style="display:flex;gap:0.35rem">';
      html += '<button class="btn-edit" data-edit-id="' + u.id + '">Edit</button>';
      html += '<button class="btn-danger" data-delete-id="' + u.id + '">Delete</button>';
      html += '</div></div>';
      if (u.source_url) html += '<p><a href="' + esc(u.source_url) + '" target="_blank">' + esc(u.source_title || u.source_url) + '</a></p>';
      if (u.summary_en) html += '<p>' + esc(u.summary_en) + '</p>';
      if (u.summary_fr) html += '<p style="font-style:italic">' + esc(u.summary_fr) + '</p>';
      // Hidden edit form
      html += '<div class="edit-form" id="edit-form-' + u.id + '" style="display:none;margin-top:0.5rem">';
      html += '<div class="update-form">';
      html += '<div><label>Date *</label><input type="date" id="editDate-' + u.id + '" value="' + esc(u.date) + '"></div>';
      html += '<div><label>Sentiment</label><select id="editSentiment-' + u.id + '">';
      for (const s of ['', 'positive', 'negative', 'neutral', 'mixed']) {
        html += '<option value="' + s + '"' + (((u.sentiment || '') === s) ? ' selected' : '') + '>' + (s || '—') + '</option>';
      }
      html += '</select></div>';
      html += '<div><label>Source URL</label><input type="url" id="editUrl-' + u.id + '" value="' + esc(u.source_url || '') + '"></div>';
      html += '<div><label>Source Title</label><input type="text" id="editTitle-' + u.id + '" value="' + esc(u.source_title || '') + '"></div>';
      html += '<div class="full"><label>Summary (FR)</label><textarea id="editFr-' + u.id + '">' + esc(u.summary_fr || '') + '</textarea></div>';
      html += '<div class="full"><label>Summary (EN)</label><textarea id="editEn-' + u.id + '">' + esc(u.summary_en || '') + '</textarea></div>';
      html += '<div class="actions" style="gap:0.5rem">';
      html += '<button class="btn-cancel" data-cancel-id="' + u.id + '">Cancel</button>';
      html += '<button class="btn-primary" data-save-id="' + u.id + '">Save</button>';
      html += '</div></div></div>';
      html += '</div>';
    }
    html += '</div>';
  }

  return html;
}

function bindDetailEvents() {
  document.getElementById('backBtn')?.addEventListener('click', () => { selectedId = null; detail = null; render(); });

  // Status buttons
  for (const btn of document.querySelectorAll('.status-btns button')) {
    btn.addEventListener('click', async () => {
      const status = btn.dataset.status;
      await api('/api/promises/' + encodeURIComponent(selectedId), { method: 'PATCH', body: { status } });
      // Update local data too
      const idx = promises.findIndex(p => p.id === selectedId);
      if (idx >= 0) promises[idx].status = status;
      updateStats();
      toast('Status updated: ' + status.replace(/_/g, ' '));
      loadDetail(selectedId);
    });
  }

  // Add update
  document.getElementById('addUpdateBtn')?.addEventListener('click', async () => {
    const body = {
      date: document.getElementById('upDate').value,
      source_url: document.getElementById('upUrl').value || null,
      source_title: document.getElementById('upTitle').value || null,
      summary_fr: document.getElementById('upFr').value || null,
      summary_en: document.getElementById('upEn').value || null,
      sentiment: document.getElementById('upSentiment').value || null,
    };
    if (!body.date) { alert('Date is required'); return; }
    await api('/api/promises/' + encodeURIComponent(selectedId) + '/updates', { method: 'POST', body });
    toast('Update added');
    loadDetail(selectedId);
    loadPromises(); // refresh latest in list
  });

  // Edit update — toggle form
  for (const btn of document.querySelectorAll('[data-edit-id]')) {
    btn.addEventListener('click', () => {
      const id = btn.dataset.editId;
      const form = document.getElementById('edit-form-' + id);
      if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });
  }

  // Cancel edit
  for (const btn of document.querySelectorAll('[data-cancel-id]')) {
    btn.addEventListener('click', () => {
      const form = document.getElementById('edit-form-' + btn.dataset.cancelId);
      if (form) form.style.display = 'none';
    });
  }

  // Save edit
  for (const btn of document.querySelectorAll('[data-save-id]')) {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.saveId;
      const body = {
        date: document.getElementById('editDate-' + id).value,
        source_url: document.getElementById('editUrl-' + id).value || null,
        source_title: document.getElementById('editTitle-' + id).value || null,
        summary_fr: document.getElementById('editFr-' + id).value || null,
        summary_en: document.getElementById('editEn-' + id).value || null,
        sentiment: document.getElementById('editSentiment-' + id).value || null,
      };
      if (!body.date) { alert('Date is required'); return; }
      await api('/api/updates/' + id, { method: 'PATCH', body });
      toast('Update saved');
      loadDetail(selectedId);
      loadPromises();
    });
  }

  // Delete update
  for (const btn of document.querySelectorAll('[data-delete-id]')) {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this update?')) return;
      await api('/api/updates/' + btn.dataset.deleteId, { method: 'DELETE' });
      toast('Update deleted');
      loadDetail(selectedId);
      loadPromises();
    });
  }
}

// ---------------------------------------------------------------------------
// Databases page
// ---------------------------------------------------------------------------

const SCHEDULE_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 21600000, label: 'Every 6h' },
  { value: 43200000, label: 'Every 12h' },
  { value: 86400000, label: 'Every 24h' },
  { value: 172800000, label: 'Every 48h' },
  { value: 604800000, label: 'Weekly' },
];

const DS_LABELS = {
  'permits-contracts': 'Permits & Contracts',
  '311': '311 Service Requests',
  'promises': 'Promises',
};

function fmtBytes(b) {
  if (b > 1e9) return (b / 1e9).toFixed(1) + ' GB';
  if (b > 1e6) return (b / 1e6).toFixed(1) + ' MB';
  if (b > 1e3) return (b / 1e3).toFixed(1) + ' KB';
  return b + ' B';
}

function fmtNum(n) {
  return n == null ? '0' : Number(n).toLocaleString();
}

function fmtDate(d) {
  if (!d) return 'never';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return esc(d);
    return dt.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return esc(d); }
}

function renderDatabases() {
  if (!dbData) return '<div class="empty">Loading...</div>';

  let html = '';

  // Stats bar
  html += '<div class="db-stats-bar">';
  html += '<span>Dev DB: <span class="stat-value">' + fmtBytes(dbData.dbSizeBytes) + '</span></span>';
  html += '<span>FTS: <span class="' + (dbData.hasFts ? 'stat-ok' : 'stat-warn') + '">' + (dbData.hasFts ? 'OK' : 'missing') + '</span></span>';
  // Aggregate row counts
  let totalRows = 0;
  for (const ds of Object.values(dbData.datasets)) {
    for (const tbl of Object.values(ds.tables)) totalRows += (tbl.rows || 0);
  }
  html += '<span>Total rows: <span class="stat-value">' + fmtNum(totalRows) + '</span></span>';
  html += '<button class="btn-sm" style="margin-left:auto" onclick="loadDatabases()">Refresh</button>';
  html += '</div>';

  // Dataset cards
  for (const [id, ds] of Object.entries(dbData.datasets)) {
    const label = DS_LABELS[id] || id;
    const running = ds.running;

    html += '<div class="ds-card">';
    html += '<h3>' + esc(label) + (running ? ' <span class="ds-running">running...</span>' : '') + '</h3>';

    // Tables
    html += '<div class="ds-card-tables">';
    for (const [tbl, info] of Object.entries(ds.tables)) {
      html += '<div class="tbl"><span class="tbl-name">' + esc(tbl) + '</span>';
      html += '<span class="tbl-stat">' + fmtNum(info.rows) + ' rows</span>';
      if (info.latestDate) html += '<span class="tbl-stat"> · latest: ' + esc(info.latestDate) + '</span>';
      html += '</div>';
    }
    html += '</div>';

    // Last ETL
    html += '<div class="ds-card-meta">';
    if (ds.lastEtlRun) {
      html += 'Last ETL: ' + fmtDate(ds.lastEtlRun.finishedAt) + ' (' + esc(ds.lastEtlRun.mode) + ', ' + fmtNum(ds.lastEtlRun.rowsLoaded) + ' rows)';
    } else {
      html += 'Last ETL: never';
    }
    html += '</div>';

    // Actions
    html += '<div class="ds-card-actions">';
    html += '<button class="btn-sm btn-sm-accent" data-update="' + id + '"' + (running ? ' disabled' : '') + '>Update</button>';
    html += '<button class="btn-sm" data-update-full="' + id + '"' + (running ? ' disabled' : '') + '>Full Refresh</button>';
    if (running) html += '<button class="btn-sm" data-show-log="' + id + '">View Log</button>';

    // Schedule
    html += '<div class="schedule-group">';
    html += '<select data-schedule="' + id + '">';
    for (const opt of SCHEDULE_OPTIONS) {
      html += '<option value="' + opt.value + '"' + (ds.schedule.interval === opt.value ? ' selected' : '') + '>' + opt.label + '</option>';
    }
    html += '</select>';
    html += '<label><input type="checkbox" data-autopublish="' + id + '"' + (ds.schedule.autoPublish ? ' checked' : '') + '> Auto-publish</label>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
  }

  // Terminal
  html += '<div class="terminal-header"><h3>Terminal</h3>';
  if (activeLogDataset) html += '<button class="btn-sm" onclick="closeLog()">Close</button>';
  html += '</div>';
  html += '<div class="terminal" id="terminal"><pre id="terminalPre">' + (terminalLogs.length ? terminalLogs.map(l => esc(l)).join('\\n') : 'No active ETL. Click "Update" to start.') + '</pre></div>';

  // Danger zone
  html += '<div class="danger-zone">';
  html += '<h3>Danger Zone</h3>';
  html += '<div class="danger-btns">';
  html += '<button class="btn-danger-lg" data-purge="permits-contracts">Purge Permits & Contracts</button>';
  html += '<button class="btn-danger-lg" data-purge="311">Purge 311 Data</button>';
  html += '<button class="btn-danger-lg" data-purge="promises">Purge Promises</button>';
  html += '<button class="btn-danger-lg" data-purge="all" style="border-color:#991b1b;color:#991b1b">Purge All Data</button>';
  html += '</div></div>';

  return html;
}

function bindDatabasesEvents() {
  // Update buttons
  for (const btn of document.querySelectorAll('[data-update]')) {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.update;
      await api('/api/databases/' + id + '/update', { method: 'POST' });
      toast('ETL started: ' + (DS_LABELS[id] || id));
      connectLog(id);
      loadDatabases();
    });
  }
  for (const btn of document.querySelectorAll('[data-update-full]')) {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.updateFull;
      if (!confirm('Run full ETL for ' + (DS_LABELS[id] || id) + '? This fetches ALL data from source.')) return;
      await api('/api/databases/' + id + '/update?mode=full', { method: 'POST' });
      toast('Full ETL started: ' + (DS_LABELS[id] || id));
      connectLog(id);
      loadDatabases();
    });
  }
  // View log buttons
  for (const btn of document.querySelectorAll('[data-show-log]')) {
    btn.addEventListener('click', () => connectLog(btn.dataset.showLog));
  }
  // Schedule selects
  for (const sel of document.querySelectorAll('[data-schedule]')) {
    sel.addEventListener('change', async () => {
      const id = sel.dataset.schedule;
      const cb = document.querySelector('[data-autopublish="' + id + '"]');
      await api('/api/databases/' + id + '/schedule', { method: 'POST', body: { interval: Number(sel.value), autoPublish: cb?.checked || false } });
      toast('Schedule updated');
    });
  }
  for (const cb of document.querySelectorAll('[data-autopublish]')) {
    cb.addEventListener('change', async () => {
      const id = cb.dataset.autopublish;
      const sel = document.querySelector('[data-schedule="' + id + '"]');
      await api('/api/databases/' + id + '/schedule', { method: 'POST', body: { interval: Number(sel?.value || 0), autoPublish: cb.checked } });
      toast('Auto-publish ' + (cb.checked ? 'enabled' : 'disabled'));
    });
  }
  // Purge buttons
  for (const btn of document.querySelectorAll('[data-purge]')) {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.purge;
      const label = id === 'all' ? 'ALL DATA' : (DS_LABELS[id] || id);
      if (!confirm('Purge ' + label + '? This will DELETE all rows.')) return;
      const typed = prompt('Type "' + id + '" to confirm:');
      if (typed !== id) { alert('Confirmation did not match. Cancelled.'); return; }
      const endpoint = id === 'all' ? '/api/databases/purge-all' : '/api/databases/' + id + '/purge';
      const res = await api(endpoint, { method: 'POST', body: { confirm: id } });
      if (res.ok) { toast('Purged ' + label); loadDatabases(); }
      else alert('Purge failed: ' + (res.error || 'unknown error'));
    });
  }
  // Scroll terminal to bottom
  const terminal = document.getElementById('terminal');
  if (terminal) terminal.scrollTop = terminal.scrollHeight;
}

function connectLog(datasetId) {
  if (activeLogSource) { activeLogSource.close(); activeLogSource = null; }
  activeLogDataset = datasetId;
  terminalLogs = [];
  const source = new EventSource('/api/databases/' + datasetId + '/logs');
  activeLogSource = source;

  source.onmessage = (e) => {
    try { terminalLogs.push(JSON.parse(e.data)); } catch { terminalLogs.push(e.data); }
    const pre = document.getElementById('terminalPre');
    if (pre) {
      pre.textContent = terminalLogs.join('\\n');
      const terminal = document.getElementById('terminal');
      if (terminal) terminal.scrollTop = terminal.scrollHeight;
    }
  };

  source.addEventListener('status', (e) => {
    const status = JSON.parse(e.data);
    if (!status.running && terminalLogs.length > 0) {
      // ETL finished — refresh stats
      setTimeout(loadDatabases, 1000);
    }
  });

  source.onerror = () => {
    source.close();
    activeLogSource = null;
  };
}

function closeLog() {
  if (activeLogSource) { activeLogSource.close(); activeLogSource = null; }
  activeLogDataset = null;
  terminalLogs = [];
  render();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------
async function deployToLive() {
  if (!confirm('Publish all changes to live? This will rebuild and restart the production server (~30s).')) return;
  const btn = document.getElementById('deployBtn');
  btn.disabled = true;
  btn.textContent = 'Publishing...';
  try {
    const res = await fetch('/api/deploy', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      toast('Published to live in ' + data.duration);
    } else {
      alert('Deploy failed at step "' + data.step + '": ' + data.error);
    }
  } catch (err) {
    alert('Deploy request failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Publish to Live';
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
loadPromises();
</script>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

app.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Promise Tracker Admin running at http://127.0.0.1:${PORT}\n`);
});
