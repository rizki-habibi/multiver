import { NextResponse } from "next/server";
import { getMitmStatus } from "@/mitm/manager";
import { getMultiverPort } from "@/shared/constants/config";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Runtime health of the Kiro MITM path. Every check hits a real subsystem:
// port listener, gateway /health, MITM process + /_mitm_health, CA trust,
// hosts-file DNS entries, and live traffic counts. No boolean theater.
export async function GET() {
  try {
    const status = await getMitmStatus().catch(() => ({
      running: false, pid: null, certExists: false, certTrusted: false, dnsStatus: {},
    }));

    const runtimeStats = await readMitmStats();

    // Derive lifecycle state from observed signals, not a stored boolean:
    //   STOPPED   — no process, no PID file
    //   STARTING  — process exists but health endpoint not answering yet
    //   RUNNING   — health OK + (cert trusted or cert exists)
    //   DEGRADED  — running but a warning-grade check failed (untrusted CA, no DNS, no traffic)
    //   ERROR     — running but health endpoint failing
    let state = "STOPPED";
    if (status.running) {
      const health = await probeMitmHealth();
      if (health.ok) {
        const degraded = !status.certTrusted || !status.dnsStatus?.kiro;
        state = degraded ? "DEGRADED" : "RUNNING";
      } else {
        state = health.started ? "ERROR" : "STARTING";
      }
    }

    const checks = await buildChecks(status, runtimeStats, state);

    const fails = checks.filter((c) => c.status === "FAIL");
    const warns = checks.filter((c) => c.status === "WARN");
    const overall = fails.length ? "FAIL" : warns.length ? "WARN" : "PASS";
    const summary = fails[0]?.reason
      || (warns.length ? `${warns.length} peringatan: ${warns[0].reason}` : "Semua cek lulus");

    logger.info("MITM", `diagnostic overall=${overall} state=${state} intercepted=${runtimeStats.intercepted}`);

    return NextResponse.json({
      overall,
      state,
      summary,
      checks,
      stats: runtimeStats,
      status: {
        running: status.running,
        pid: status.pid || null,
        certExists: status.certExists || false,
        certTrusted: status.certTrusted || false,
        dnsKiro: !!status.dnsStatus?.kiro,
      },
      gatewayPort: getMultiverPort(),
    });
  } catch (error) {
    logger.error("MITM", `diagnostic failed: ${error.message}`);
    return NextResponse.json({ error: "Failed to run diagnostics" }, { status: 500 });
  }
}

async function probeMitmHealth() {
  const port = Number(process.env.MULTIVER_MITM_PORT || 443);
  try {
    const res = await fetch(`https://127.0.0.1:${port}/_mitm_health`, { rejectUnauthorized: false });
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: true, started: true, stats: body.stats || {} };
    }
    return { ok: false, started: true };
  } catch {
    // A connection refused right after spawn means the process is still starting.
    return { ok: false, started: false };
  }
}

// Stats live in DATA_DIR/logs/mitm/stats.json, written by the MITM child process.
async function readMitmStats() {
  try {
    const path = await resolveStatsPath();
    if (!path) return { intercepted: 0, lastInterceptAt: null, lastModel: null };
    const fs = await import("fs");
    if (!fs.existsSync(path)) return { intercepted: 0, lastInterceptAt: null, lastModel: null };
    const raw = JSON.parse(fs.readFileSync(path, "utf-8"));
    return {
      intercepted: Number(raw.intercepted) || 0,
      lastInterceptAt: raw.lastInterceptAt || null,
      lastModel: raw.lastModel || null,
    };
  } catch {
    return { intercepted: 0, lastInterceptAt: null, lastModel: null };
  }
}

async function resolveStatsPath() {
  // src/mitm/paths.js is CJS; replicate its DATA_DIR resolution for ESM context.
  const os = await import("os");
  const p = await import("path");
  const dataDir = process.env.DATA_DIR
    || (process.platform === "win32"
      ? p.join(process.env.APPDATA || p.join(os.homedir(), "AppData", "Roaming"), "Multiver")
      : p.join(os.homedir(), ".Multiver"));
  return p.join(dataDir, "logs", "mitm", "stats.json");
}

async function buildChecks(status, stats, state) {
  const checks = [];
  const port = getMultiverPort();

  // Gateway port — real listener probe
  checks.push(await checkPort("Gateway port " + port, "GATEWAY", port));

  // Gateway health
  checks.push(await checkGateway("/health", "GATEWAY", port));

  // MITM process
  checks.push({
    name: "MITM process",
    category: "MITM",
    status: status.running ? "PASS" : "FAIL",
    reason: status.running
      ? `MITM berjalan (PID ${status.pid || "?"})`
      : "MITM tidak berjalan. Tekan Start di halaman Kiro MITM.",
  });

  // MITM health + traffic
  if (status.running) {
    const health = await probeMitmHealth();
    checks.push({
      name: "MITM engine",
      category: "MITM",
      status: health.ok ? "PASS" : (state === "STARTING" ? "WARN" : "FAIL"),
      reason: health.ok
        ? "Engine merespon /_mitm_health"
        : (state === "STARTING" ? "Masih start…" : "Health endpoint gagal"),
    });

    checks.push({
      name: "Kiro traffic",
      category: "KIRO",
      status: stats.intercepted > 0 ? "PASS" : "WARN",
      reason: stats.intercepted > 0
        ? `${stats.intercepted} request Kiro diintercept (model terakhir: ${stats.lastModel || "?"})`
        : "MITM aktif tapi belum mendeteksi traffic Kiro. Buka Kiro IDE dan kirim satu prompt.",
    });
  }

  // Certificate
  checks.push({
    name: "CA certificate",
    category: "SECURITY",
    status: !status.certExists ? "FAIL" : !status.certTrusted ? "WARN" : "PASS",
    reason: !status.certExists
      ? "CA belum dibuat. Start MITM untuk generate."
      : !status.certTrusted
        ? "CA ada tapi BELUM dipercaya sistem. Klik \"Install Certificate\" — Kiro menolak TLS tanpa trust."
        : "CA terpasang dan dipercaya",
  });

  // Kiro DNS
  checks.push({
    name: "Kiro target DNS",
    category: "MITM",
    status: status.dnsStatus?.kiro ? "PASS" : "WARN",
    reason: status.dnsStatus?.kiro
      ? "Host Kiro diarahkan ke 127.0.0.1 (hosts file)"
      : "Host Kiro belum di hosts file. Aktifkan toggle DNS — tanpa ini Kiro tidak lewat MITM.",
  });

  // Provider
  checks.push(await checkProvider(port));

  // Logging
  checks.push(await checkLogging());

  return checks;
}

async function checkPort(name, category, port) {
  try {
    const net = await import("net");
    const inUse = await new Promise((resolve) => {
      const t = net.createServer();
      t.once("error", () => resolve(true));
      t.once("listening", () => t.close(() => resolve(false)));
      t.listen({ port, host: "127.0.0.1", exclusive: true });
    });
    return {
      name, category,
      status: inUse ? "PASS" : "FAIL",
      reason: inUse ? `Port ${port} listening` : `Port ${port} tidak listening. Mulai Multiver.`,
    };
  } catch (e) {
    return { name, category, status: "WARN", reason: `Cek port gagal: ${e.message}` };
  }
}

async function checkGateway(name, category, port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(4000) });
    return {
      name, category,
      status: res.ok ? "PASS" : "FAIL",
      reason: res.ok ? "Gateway merespon 200" : `Gateway balas ${res.status}`,
    };
  } catch (e) {
    return { name, category, status: "FAIL", reason: `Gateway tidak merespon: ${e.message}` };
  }
}

async function checkProvider(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/models`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { name: "Provider", category: "PROVIDER", status: "WARN", reason: `/v1/models balas ${res.status}` };
    const body = await res.json().catch(() => ({ data: [] }));
    const n = body.data?.length || 0;
    return {
      name: "Provider", category: "PROVIDER",
      status: n > 0 ? "PASS" : "WARN",
      reason: n > 0 ? `${n} model terdaftar di gateway` : "0 model — cek koneksi provider",
    };
  } catch (e) {
    return { name: "Provider", category: "PROVIDER", status: "FAIL", reason: `/v1/models gagal: ${e.message}` };
  }
}

async function checkLogging() {
  try {
    const { logger } = await import("@/lib/logger");
    const { getRecentLogs } = await import("@/lib/logger");
    const logs = getRecentLogs(1);
    return {
      name: "Logging", category: "SYSTEM",
      status: "PASS",
      reason: logs.length > 0 ? "Log Konsol aktif" : "Log Konsol aktif (belum ada baris)",
    };
  } catch (e) {
    return { name: "Logging", category: "SYSTEM", status: "WARN", reason: `Logger belum siap: ${e.message}` };
  }
}
