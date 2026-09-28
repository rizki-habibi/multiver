// Worker body for the MySQL sync adapter.
// Owns ONE mysql2 connection and writes results into a SharedArrayBuffer handed
// over by the main thread, then flips an atomic flag to unblock it. This keeps
// the repo's synchronous `db.get/all/run/transaction(fn)` contract intact.
import { createConnection } from "mysql2";

let conn = null;
let cfg = null;
let view = null;
let flag = null;
let len32 = null;
const HEADER = 8;

const FLAG_IDLE = 0;
const FLAG_DONE = 1;

function publish(payload) {
  const bytes = Buffer.from(JSON.stringify(payload), "utf8");
  if (bytes.length > view.length - HEADER) {
    const msg = `[db:mysql] result too large for channel (${bytes.length} bytes)`;
    bytes = Buffer.from(JSON.stringify({ ok: false, error: { message: msg } }), "utf8");
  }
  view.fill(0, HEADER, HEADER + bytes.length);
  view.set(bytes, HEADER);
  Atomics.store(len32, 0, bytes.length);
  Atomics.store(flag, 0, FLAG_DONE);
  Atomics.notify(flag, 0);
}

function connectOnce() {
  if (conn) return conn;
  conn = new Promise((resolve, reject) => {
    const c = createConnection({
      host: cfg.host || "127.0.0.1",
      port: cfg.port || 3306,
      user: cfg.user || "root",
      password: cfg.password ?? "",
      database: cfg.database,
      connectTimeout: cfg.connectTimeout ?? 5000,
      decimalNumbers: true,
      enableKeepAlive: true,
    });
    c.on("error", (e) => {
      // Connection-level fatal error: next query will fail fast and the adapter
      // drops the cached promise so a retry reconnects.
      if (e.fatal) conn = null;
    });
    c.connect((err) => (err ? reject(err) : resolve(c)));
  });
  return conn;
}

function shape(rows) {
  if (!Array.isArray(rows)) {
    return { changes: Number(rows?.affectedRows ?? 0), lastInsertRowid: Number(rows?.insertId ?? 0) };
  }
  return rows.map((r) => ({ ...r }));
}

function query(sql, params) {
  return new Promise((resolve, reject) => {
    connectOnce().then((c) => {
      c.query(sql, params ?? [], (err, rows) => (err ? reject(err) : resolve(shape(rows))));
    }).catch(reject);
  });
}

function control(name) {
  return new Promise((resolve, reject) => {
    connectOnce().then((c) => {
      c[name]((err) => (err ? reject(err) : resolve()));
    }).catch(reject);
  });
}

async function handle(msg) {
  if (msg.type === "channel") {
    view = new Uint8Array(msg.sab);
    flag = new Int32Array(msg.sab, 0, 1);
    len32 = new Uint32Array(msg.sab, 4, 1);
    publish({ ok: true, value: null });
    return;
  }
  try {
    if (msg.type === "init") {
      cfg = msg.cfg;
      await connectOnce();
      return { ok: true };
    }
    if (msg.type === "query") {
      return { ok: true, value: await query(msg.sql, msg.params) };
    }
    if (msg.type === "begin") return { ok: true, value: await control("beginTransaction") };
    if (msg.type === "commit") return { ok: true, value: await control("commit") };
    if (msg.type === "rollback") return { ok: true, value: await control("rollback") };
    if (msg.type === "ping") return { ok: true, value: await query("SELECT 1", []) };
    if (msg.type === "close") {
      try { (await connectOnce()).end(); } catch { }
      return { ok: true };
    }
    return { ok: false, error: { message: `unknown message type ${msg.type}` } };
  } catch (e) {
    return { ok: false, error: { message: e.message, code: e.code, errno: e.errno, sqlState: e.sqlState } };
  }
}

onmessage = async (e) => {
  const out = await handle(e.data);
  if (out !== undefined) publish(out);
};
