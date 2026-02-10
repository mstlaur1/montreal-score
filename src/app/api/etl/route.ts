import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { execFile } from "node:child_process";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";

const TOKEN = process.env.ADMIN_API_TOKEN;
// process.cwd() in standalone points to .next/standalone/, not the project root
const PROJECT_DIR = process.env.PROJECT_DIR;
if (!PROJECT_DIR) {
  console.error("PROJECT_DIR environment variable is required for the ETL API route");
}
const TSX = PROJECT_DIR ? path.join(PROJECT_DIR, "node_modules", ".bin", "tsx") : "";
const NODE = process.execPath;

// Simple rate limiting: 1 ETL request per 60 seconds
let lastEtlRequest = 0;
const ETL_COOLDOWN_MS = 60_000;

const DATASETS = {
  permits: {
    script: "scripts/etl.ts",
    revalidate: ["/fr/permits", "/en/permits", "/fr/contracts", "/en/contracts", "/fr", "/en"],
  },
  "311": {
    script: "scripts/etl-311.ts",
    revalidate: ["/fr/311", "/en/311", "/fr", "/en"],
  },
} as const;

type Dataset = keyof typeof DATASETS;

function runScript(bin: string, script: string, args: string[], timeoutMs = 300_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(bin, [script, ...args], { cwd: PROJECT_DIR, timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${err.message}\nstdout: ${stdout}\nstderr: ${stderr}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

export async function POST(req: NextRequest) {
  if (!TOKEN) {
    return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 500 });
  }

  const auth = req.headers.get("authorization");
  const expected = `Bearer ${TOKEN}`;
  if (!auth || Buffer.byteLength(auth) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!PROJECT_DIR) {
    return NextResponse.json({ error: "PROJECT_DIR not configured" }, { status: 500 });
  }

  const now = Date.now();
  if (now - lastEtlRequest < ETL_COOLDOWN_MS) {
    return NextResponse.json({ error: "Rate limited. Try again later." }, { status: 429 });
  }
  lastEtlRequest = now;

  let body: { dataset?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const dataset = body.dataset as Dataset | "all" | undefined;
  const mode = body.mode === "full" ? "full" : "incremental";

  if (!dataset || (dataset !== "all" && !DATASETS[dataset as Dataset])) {
    return NextResponse.json(
      { error: `Invalid dataset. Must be one of: ${Object.keys(DATASETS).join(", ")}, all` },
      { status: 400 },
    );
  }

  const args = mode === "full" ? ["--full"] : [];
  const timeout = mode === "full" ? 900_000 : 300_000; // 15min for full, 5min for incremental
  const results: Record<string, { ok: boolean; output?: string; error?: string }> = {};
  const toRun = dataset === "all" ? Object.keys(DATASETS) as Dataset[] : [dataset as Dataset];

  for (const ds of toRun) {
    const { script, revalidate: paths } = DATASETS[ds];
    try {
      const { stdout } = await runScript(TSX, script, args, timeout);
      results[ds] = { ok: true, output: stdout.trim().split("\n").slice(-5).join("\n") };
      for (const p of paths) revalidatePath(p);
    } catch (err) {
      results[ds] = { ok: false, error: (err as Error).message.slice(0, 500) };
    }
  }

  // Also rebuild FTS index after permits/contracts ETL
  if (dataset === "all" || dataset === "permits") {
    try {
      await runScript(NODE, "scripts/migrations/build-fts.js", []);
      results["fts"] = { ok: true };
    } catch (err) {
      results["fts"] = { ok: false, error: (err as Error).message.slice(0, 500) };
    }
  }

  const allOk = Object.values(results).every((r) => r.ok);
  return NextResponse.json({ ok: allOk, mode, results }, { status: allOk ? 200 : 207 });
}
