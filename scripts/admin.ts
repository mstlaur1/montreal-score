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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data", "montreal.db");
const PORT = Number(process.env.PORT) || 3099;

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

  /* Filters bar */
  .filters { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .filters input, .filters select {
    background: var(--surface); border: 1px solid var(--border); color: var(--text);
    padding: 0.4rem 0.6rem; border-radius: 6px; font-size: 0.85rem;
  }
  .filters input { flex: 1; min-width: 200px; }

  /* Promise table */
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th { text-align: left; padding: 0.5rem; border-bottom: 2px solid var(--border); color: var(--muted); font-weight: 500; }
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
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>Promise Tracker Admin</h1>
    <div class="stats" id="stats"></div>
  </header>

  <div id="app"></div>
  <div class="toast" id="toast"></div>
</div>

<script>
// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let promises = [];
let selectedId = null;
let detail = null; // { promise, updates }
let searchTerm = '';
let filterStatus = '';
let filterCategory = '';
let filterBorough = '';

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
  return promises.filter(p => {
    if (searchTerm && !p.text_en.toLowerCase().includes(searchTerm.toLowerCase())
      && !p.text_fr.toLowerCase().includes(searchTerm.toLowerCase())
      && !p.id.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterStatus && p.status !== filterStatus) return false;
    if (filterCategory && p.category !== filterCategory) return false;
    if (filterBorough && (p.borough || '') !== filterBorough) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render() {
  const app = document.getElementById('app');
  if (selectedId && detail) {
    app.innerHTML = renderDetail();
    bindDetailEvents();
  } else {
    app.innerHTML = renderList();
    bindListEvents();
  }
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

  html += '<table><thead><tr><th>ID</th><th>Promise</th><th>Category</th><th>Status</th><th>Latest</th></tr></thead><tbody>';
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

function bindListEvents() {
  document.getElementById('search')?.addEventListener('input', e => { searchTerm = e.target.value; render(); });
  document.getElementById('filterStatus')?.addEventListener('change', e => { filterStatus = e.target.value; render(); });
  document.getElementById('filterCategory')?.addEventListener('change', e => { filterCategory = e.target.value; render(); });
  document.getElementById('filterBorough')?.addEventListener('change', e => { filterBorough = e.target.value; render(); });
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
// Helpers
// ---------------------------------------------------------------------------
function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
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

app.listen(PORT, () => {
  console.log(`\n  Promise Tracker Admin running at http://localhost:${PORT}\n`);
});
