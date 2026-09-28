// Sync-shaped MySQL adapter.
// mysql2 has no synchronous API, but every repo calls db.get/all/run/transaction
// synchronously. We keep that contract by running mysql2 inside a worker thread
// and blocking the caller on Atomics.wait() while the worker writes the JSON
// response into a SharedArrayBuffer and flips an atomic flag.
//
// ponytail: ceiling — one serial connection. All repos are request-scoped and
// low-concurrency. If parallel MySQL writes are ever needed, bump the worker
// count and shard by table.
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_FILE = path.join(__dirname, "mysqlWorker.mjs");

const FLAG_IDLE = 0;
const FLAG_DONE = 1;
const HEADER = 8; // 4-byte flag + 4-byte payload length
const BUF_LEN = 8 * 1024 * 1024; // 8 MiB — largest expected single result set

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
    console.error("[db:mysql] worker error:", e.message || e);
    worker = null;
  });
  // Give the worker the shared buffer so it can publish responses.
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
    const err = new Error(out.error?.message || "MySQL worker error");
    err.code = out.error?.code;
    err.errno = out.error?.errno;
    err.sqlState = out.error?.sqlState;
    throw err;
  }
  return out.value;
}

/**
 * Create the MySQL adapter.
 * @param {{host?:string, port?:number, user?:string, password?:string, database:string}} cfg
 */
export function createMysqlAdapter(cfg) {
  return {
    driver: "mysql",
    run(sql, params = []) { return send("query", { cfg, sql, params }); },
    get(sql, params = []) {
      const rows = send("query", { cfg, sql, params });
      return Array.isArray(rows) && rows.length > 0 ? rows[0] : undefined;
    },
    all(sql, params = []) {
      const rows = send("query", { cfg, sql, params });
      return Array.isArray(rows) ? rows : [];
    },
    exec(sql) { return send("query", { cfg, sql, params: [] }); },
    transaction(fn) {
      send("begin", { cfg });
      try {
        const value = fn();
        send("commit", { cfg });
        return value;
      } catch (e) {
        try { send("rollback", { cfg }); } catch { }
        throw e;
      }
    },
    checkpoint() { send("ping", { cfg }); },
    close() {
      try { send("close", { cfg }); } catch { }
      try { worker?.terminate(); } catch { }
      worker = null;
    },
  };
}
