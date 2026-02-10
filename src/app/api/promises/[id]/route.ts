import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { getWriteDb } from "@/lib/db-write";

const VALID_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "broken",
  "partially_met",
];

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  const { id } = await ctx.params;

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.status || !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const db = getWriteDb();
  const result = db
    .prepare(
      "UPDATE promises SET status = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .run(body.status, id);

  if (result.changes === 0) {
    return NextResponse.json(
      { error: `Promise '${id}' not found` },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, id, status: body.status });
});
