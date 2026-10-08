import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";

function hashApiKey(key) {
  return `sha256:${crypto.createHash("sha256").update(String(key), "utf8").digest("hex")}`;
}

function maskApiKey(hashOrKey) {
  if (!hashOrKey) return "";
  if (String(hashOrKey).startsWith("sha256:")) return "sha256:stored";
  const value = String(hashOrKey);
  return value.length > 8 ? `${value.slice(0, 5)}…${value.slice(-4)}` : "stored";
}

function rowToKey(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: maskApiKey(row.key),
    name: row.name,
    machineId: row.machineId,
    isActive: row.isActive === 1 || row.isActive === true,
    scopeType: row.scopeType || "global",
    scopeProvider: row.scopeProvider || null,
    createdAt: row.createdAt,
  };
}

export async function getApiKeys() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM apiKeys ORDER BY createdAt ASC`);
  return rows.map(rowToKey);
}

export async function getApiKeyById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
  return rowToKey(row);
}

export async function createApiKey(name, machineId, scopeType = "private", scopeProvider = null) {
  if (!machineId) throw new Error("machineId is required");
  const normalizedScope = scopeType === "global" ? "global" : "private";
  const normalizedProvider = normalizedScope === "private" && scopeProvider
    ? String(scopeProvider).trim()
    : null;
  if (normalizedScope === "private" && !normalizedProvider) {
    throw new Error("scopeProvider is required for private API keys");
  }
  const db = await getAdapter();
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const result = generateApiKeyWithMachine(machineId);
  const apiKey = {
    id: uuidv4(),
    name,
    key: result.key,
    machineId,
    isActive: true,
    scopeType: normalizedScope,
    scopeProvider: normalizedProvider,
    createdAt: new Date().toISOString(),
  };
  db.run(
    `INSERT INTO apiKeys(id, key, name, machineId, isActive, scopeType, scopeProvider, createdAt) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
    [apiKey.id, hashApiKey(apiKey.key), apiKey.name, apiKey.machineId, 1, apiKey.scopeType, apiKey.scopeProvider, apiKey.createdAt]
  );
  // The raw key is returned only at creation time; it is never read back from DB.
  return apiKey;
}

export async function updateApiKey(id, data) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
  if (!row) return null;
  const name = data?.name ?? row.name;
  const machineId = data?.machineId ?? row.machineId;
  const isActive = data?.isActive !== undefined ? Boolean(data.isActive) : (row.isActive === 1 || row.isActive === true);
  const scopeType = data?.scopeType !== undefined ? (data.scopeType === "global" ? "global" : "private") : (row.scopeType || "global");
  const scopeProvider = scopeType === "private"
    ? (data?.scopeProvider !== undefined ? String(data.scopeProvider || "").trim() : (row.scopeProvider || null))
    : null;
  if (scopeType === "private" && !scopeProvider) throw new Error("scopeProvider is required for private API keys");
  const nextKey = data?.key ? hashApiKey(data.key) : row.key;
  db.run(
    `UPDATE apiKeys SET key = ?, name = ?, machineId = ?, isActive = ?, scopeType = ?, scopeProvider = ? WHERE id = ?`,
    [nextKey, name, machineId, isActive ? 1 : 0, scopeType, scopeProvider, id]
  );
  return {
    id,
    key: maskApiKey(nextKey),
    name,
    machineId,
    isActive,
    scopeType,
    scopeProvider,
    createdAt: row.createdAt,
  };
}

export async function deleteApiKey(id) {
  const db = await getAdapter();
  const res = db.run(`DELETE FROM apiKeys WHERE id = ?`, [id]);
  return (res?.changes ?? 0) > 0;
}

export async function getApiKeyAccess(key) {
  if (!key) return null;
  const db = await getAdapter();
  const hash = hashApiKey(key);
  const row = db.get(
    `SELECT id, isActive, scopeType, scopeProvider FROM apiKeys WHERE key = ?`,
    [hash]
  );
  if (!row || !(row.isActive === 1 || row.isActive === true)) return null;
  const scopeType = row.scopeType === "private" ? "private" : "global";
  return {
    id: row.id,
    scopeType,
    scopeProvider: scopeType === "private" ? (row.scopeProvider || null) : null,
  };
}

export async function validateApiKey(key) {
  return Boolean(await getApiKeyAccess(key));
}
