import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { getWriteDb } from "@/lib/db-write";

const VALID_SENTIMENTS = ["positive", "negative", "neutral", "mixed"];
const VALID_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "broken",
  "partially_met",
];

interface UpdateBody {
  date: string;
  source_url?: string;
  source_title?: string;
  summary_fr?: string;
  summary_en?: string;
  sentiment?: string;
  status?: string;
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { id } = await ctx.params;

  let body: UpdateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json(
      { error: "date is required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  if (body.sentiment && !VALID_SENTIMENTS.includes(body.sentiment)) {
    return NextResponse.json(
      { error: `Invalid sentiment. Must be one of: ${VALID_SENTIMENTS.join(", ")}` },
      { status: 400 }
    );
  }

  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const db = getWriteDb();

  // Verify promise exists
  const promise = db
    .prepare("SELECT id FROM promises WHERE id = ?")
    .get(id);
  if (!promise) {
    return NextResponse.json(
      { error: `Promise '${id}' not found` },
      { status: 404 }
    );
  }

  // Insert update
  db.prepare(
    `INSERT INTO promise_updates (promise_id, date, source_url, source_title, summary_fr, summary_en, sentiment)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    body.date,
    body.source_url ?? null,
    body.source_title ?? null,
    body.summary_fr ?? null,
    body.summary_en ?? null,
    body.sentiment ?? null
  );

  // Update promise status if provided
  if (body.status) {
    db.prepare(
      "UPDATE promises SET status = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(body.status, id);
  }

  return NextResponse.json({ ok: true, id });
});
