# Promise Status Update Guide

How to update campaign promise statuses in MontréalScore.

## Quick Start

1. Run the update prompt below with Claude
2. Review the suggested changes
3. Apply changes to `data/promises-seed.ts` (status field) and/or add news entries to SQLite
4. Re-seed and rebuild: `npm run promises:seed && npm run build`

## Claude Prompt Template

Copy-paste this prompt to Claude, adjusting the date range:

---

**Prompt:**

> Search for recent news (last 30 days) about Montreal Mayor Soraya Martinez Ferrada's campaign promises. For each promise below, find evidence of progress, completion, or failure. Return a structured update for each promise where you find relevant news.
>
> Promises to check:
> [paste promise IDs and text_fr from promises-seed.ts]
>
> For each promise with news, return:
> - **promise_id**: the ID from the seed file
> - **new_status**: not_started | in_progress | completed | broken | partially_met
> - **source_url**: link to the news article
> - **source_title**: article headline
> - **summary_fr**: 1-2 sentence summary in French
> - **summary_en**: 1-2 sentence summary in English
> - **sentiment**: positive | negative | neutral | mixed
> - **date**: YYYY-MM-DD of the article
>
> Only update promises where you have concrete evidence. Skip promises with no news.

---

## Applying Status Changes

### Update promise statuses in seed file

Edit `data/promises-seed.ts` — the seed file doesn't have a `status` field (it defaults to `not_started`). To change statuses, update them directly in SQLite:

```bash
sqlite3 data/montreal.db "UPDATE promises SET status = 'in_progress' WHERE id = 'housing-01';"
```

### Add news entries to SQLite

```bash
sqlite3 data/montreal.db "INSERT INTO promise_updates (promise_id, date, source_url, source_title, summary_fr, summary_en, sentiment) VALUES ('housing-01', '2026-02-01', 'https://example.com/article', 'Article Title', 'Résumé en français.', 'English summary.', 'positive');"
```

### Batch update script

For multiple updates, create a SQL file (`updates.sql`) and run:

```bash
sqlite3 data/montreal.db < updates.sql
```

## Status Definitions

| Status | Meaning |
|--------|---------|
| `not_started` | No action taken yet |
| `in_progress` | Work has begun but not completed |
| `completed` | Promise fully delivered |
| `broken` | Promise explicitly abandoned or contradicted |
| `partially_met` | Some progress but falls short of the commitment |

## Frequency

- **First 100 days**: Weekly updates recommended (deadline: Feb 18, 2026)
- **After 100 days**: Monthly updates sufficient
- **Major events**: Update after council meetings, budget announcements, press conferences

## Adding New Promises

To add the remaining ~140 platform promises later:

1. Read the platform text from `/tmp/ensemble-mtl-plateforme.txt` (or re-extract from PDF)
2. Add entries to `data/promises-seed.ts` following the existing format
3. Run `npm run promises:seed` to load them
4. Rebuild: `npm run build`
