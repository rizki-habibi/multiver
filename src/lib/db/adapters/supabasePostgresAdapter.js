import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_FILE = path.join(__dirname, "supabasePostgresWorker.mjs");

const FLAG_IDLE = 0;
const FLAG_DONE = 1;
const HEADER = 8;
const BUF_LEN = 8 * 1024 * 1024;

let worker = null;
let view = null;
let flag = null;
let len32 = null;
let idSeq = 0;

function ensureChannel() {
  if (worker) return;
  const sab = new SharedArrayBuffer(BUF_LEN);
  view = new Uint8Array(sab);
  flag = new Int32Array(sab, 0, 1);
  len32 = new Uint32Array(sab, 4, 1);
  worker = new Worker(WORKER_FILE);
  worker.on("error", (e) => {
    console.error("[DB:supabase] worker error:", e?.message || e);
    worker = null;
  });
  worker.postMessage({ type: "channel", sab });
}

function send(type, payload = {}) {
  ensureChannel();
  const id = ++idSeq;
  Atomics.store(flag, 0, FLAG_IDLE);
  worker.postMessage({ id, type, ...payload });
  Atomics.wait(flag, 0, FLAG_IDLE);
  const ok = Atomics.load(flag, 0) === FLAG_DONE;
  const len = Atomics.load(len32, 0);
  const out = JSON.parse(Buffer.from(view.slice(HEADER, HEADER + len)).toString("utf8"));
  if (!ok) {
    const err = new Error(out.error?.message || "Supabase PostgreSQL worker error");
    err.code = out.error?.code;
    err.detail = out.error?.detail;
    err.hint = out.error?.hint;
    throw err;
  }
  return out.value;
}

export function createSupabasePostgresAdapter(connectionString) {
  if (!connectionString) throw new Error("[DB:supabase] SUPABASE_DB_URL is required");

  return {
    driver: "supabase-postgres",
    run(sql, params = []) {
      return send("query", { sql, params });
    },
    get(sql, params = []) {
      const result = send("query", { sql, params });
      const rows = result?.rows || [];
      return rows.length ? rows[0] : undefined;
    },
    all(sql, params = []) {
      const result = send("query", { sql, params });
      return Array.isArray(result?.rows) ? result.rows : [];
    },
    exec(sql) {
      return send("query", { sql, params: [] });
    },
    transaction(fn) {
      send("begin");
      try {
        const value = fn();
        send("commit");
        return value;
      } catch (e) {
        try { send("rollback"); } catch {}
        throw e;
      }
    },
    checkpoint() { send("ping"); },
    close() {
      try { send("close"); } catch {}
      try { worker?.terminate(); } catch {}
      worker = null;
    },
  };
}

export function isSupabasePostgresConfigured() {
  return Boolean(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL);
}
