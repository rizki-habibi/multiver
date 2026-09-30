import postgres from "postgres";

let sab;
let view;
let flag;
let len32;
let sqlClient;
let configuredUrl;

const FLAG_IDLE = 0;
const FLAG_DONE = 1;
const HEADER = 8;
const MAX_PAYLOAD = 8 * 1024 * 1024;

function qmarksToPg(query) {
  let index = 0;
  return String(query).replace(/\?/g, () => `$${++index}`);
}

function translateSql(input) {
  let sql = String(input).trim();

  // The application uses SQLite's INSERT OR REPLACE in a few legacy paths.
  // PostgreSQL can express the same primary/unique-key replacement semantics
  // with ON CONFLICT DO UPDATE without naming a conflict target.
  const m = sql.match(/^INSERT\s+OR\s+REPLACE\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)\s*;?$/i);
  if (m) {
    const columns = m[2].split(",").map((x) => x.trim()).filter(Boolean);
    sql = `INSERT INTO ${m[1]} (${m[2]}) VALUES (${m[3]}) ON CONFLICT DO UPDATE SET ${columns.map((c) => `${c}=EXCLUDED.${c}`).join(", ")}`;
  }

  // SQLite-only boolean storage is already represented as 0/1 in the runtime
  // compatibility schema, so the remaining SQL is PostgreSQL-compatible.
  return qmarksToPg(sql);
}

async function getClient() {
  if (sqlClient && configuredUrl) return sqlClient;
  configuredUrl = Deno.env.get("SUPABASE_DB_URL") || Deno.env.get("DATABASE_URL");
  if (!configuredUrl) throw new Error("SUPABASE_DB_URL is not configured");
  sqlClient = postgres(configuredUrl, {
    max: 1,
    prepare: false,
    ssl: "require",
    connect_timeout: 15,
    connection: {
      application_name: "multiver-vercel",
      search_path: "multiver_runtime,public",
    },
  });
  return sqlClient;
}

function publish(ok, value, error) {
  const payload = JSON.stringify(ok ? { value } : {
    error: {
      message: error?.message || String(error),
      code: error?.code,
      detail: error?.detail,
      hint: error?.hint,
    },
  });
  const bytes = new TextEncoder().encode(payload);
  if (bytes.byteLength > MAX_PAYLOAD - HEADER) {
    throw new Error("Supabase DB response exceeded adapter payload limit");
  }
  view.set(bytes, HEADER);
  Atomics.store(len32, 0, bytes.byteLength);
  Atomics.store(flag, 0, FLAG_DONE);
  Atomics.notify(flag, 0);
}

async function execute(type, payload = {}) {
  if (type === "ping") {
    const db = await getClient();
    await db`select 1 as ok`;
    return { ok: true };
  }

  if (type === "close") {
    if (sqlClient) {
      await sqlClient.end({ timeout: 1 });
      sqlClient = null;
      configuredUrl = null;
    }
    return { ok: true };
  }

  const db = await getClient();

  if (type === "begin") {
    await db`begin`;
    return { ok: true };
  }
  if (type === "commit") {
    await db`commit`;
    return { ok: true };
  }
  if (type === "rollback") {
    await db`rollback`;
    return { ok: true };
  }

  if (type === "query") {
    const sql = translateSql(payload.sql);
    const params = Array.isArray(payload.params) ? payload.params : [];
    const result = await db.unsafe(sql, params);
    return {
      rows: Array.from(result),
      changes: Number(result.count || 0),
    };
  }

  throw new Error(`Unknown DB worker operation: ${type}`);
}

self.onmessage = async (event) => {
  const message = event.data || {};
  if (message.type === "channel") {
    sab = message.sab;
    view = new Uint8Array(sab);
    flag = new Int32Array(sab, 0, 1);
    len32 = new Uint32Array(sab, 4, 1);
    return;
  }

  try {
    const value = await execute(message.type, message);
    publish(true, value);
  } catch (error) {
    publish(false, null, error);
  }
};
