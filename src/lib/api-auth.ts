import { NextRequest, NextResponse } from "next/server";

const TOKEN = process.env.ADMIN_API_TOKEN;

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
    if (!auth || auth !== `Bearer ${TOKEN}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return handler(req, ctx);
  };
}
