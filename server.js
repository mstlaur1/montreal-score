/**
 * Cluster wrapper for Next.js standalone server.
 * Forks multiple workers to use all available CPU cores.
 *
 * Usage: node server.js
 * Env: PORT (default 3891), WORKERS (default: min(cpus, 8))
 */
const cluster = require("node:cluster");
const os = require("node:os");
const path = require("node:path");

const MAX_WORKERS = parseInt(process.env.WORKERS, 10) || Math.min(os.cpus().length, 8);
const PORT = process.env.PORT || "3891";

if (cluster.isPrimary) {
  console.log(`[cluster] Primary ${process.pid} starting ${MAX_WORKERS} workers on port ${PORT}`);

  for (let i = 0; i < MAX_WORKERS; i++) {
    cluster.fork();
  }

  // Track rapid restarts to prevent infinite crash loops
  const recentExits = [];
  const MAX_RAPID_RESTARTS = 5;
  const RAPID_RESTART_WINDOW_MS = 30_000;

  cluster.on("exit", (worker, code, signal) => {
    const now = Date.now();
    recentExits.push(now);
    // Keep only exits within the window
    while (recentExits.length > 0 && now - recentExits[0] > RAPID_RESTART_WINDOW_MS) {
      recentExits.shift();
    }

    if (recentExits.length >= MAX_RAPID_RESTARTS) {
      console.error(`[cluster] Worker ${worker.process.pid} exited (code=${code}, signal=${signal}). ${MAX_RAPID_RESTARTS} crashes in ${RAPID_RESTART_WINDOW_MS / 1000}s — stopping restarts.`);
      process.exit(1);
    }

    console.log(`[cluster] Worker ${worker.process.pid} exited (code=${code}, signal=${signal}). Restarting in 1s...`);
    setTimeout(() => cluster.fork(), 1000);
  });
} else {
  // Set PORT so the standalone server binds to it
  process.env.PORT = PORT;
  // The standalone server.js lives in .next/standalone/
  require(path.join(__dirname, ".next", "standalone", "server.js"));
}
