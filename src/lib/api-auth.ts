import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

const TOKEN = process.env.ADMIN_API_TOKEN;

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
