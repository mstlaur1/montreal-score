import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

const TOKEN = process.env.ADMIN_API_TOKEN;

// Simple per-IP rate limiting: max 30 requests per minute
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
let rateLimitCleanupCounter = 0;
const CLEANUP_INTERVAL = 100; // Sweep expired entries every N checks

function isRateLimited(ip: string): boolean {
  const now = Date.now();

  // Periodic cleanup of expired entries to prevent memory leak
  if (++rateLimitCleanupCounter >= CLEANUP_INTERVAL) {
    rateLimitCleanupCounter = 0;
    for (const [key, entry] of rateLimitMap) {
      if (now > entry.resetAt) rateLimitMap.delete(key);
    }
  }

  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function withAuth(
  handler: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<NextResponse>
) {
  return async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }

    if (!TOKEN) {
      return NextResponse.json(
        { error: "ADMIN_API_TOKEN not configured" },
        { status: 500 }
      );
    }

    const auth = req.headers.get("authorization");
    if (!auth || !safeCompare(auth, `Bearer ${TOKEN}`)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return handler(req, ctx);
  };
}
