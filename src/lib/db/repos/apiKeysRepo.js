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

export async function createApiKey(name, machineId) {
  if (!machineId) throw new Error("machineId is required");
  const db = await getAdapter();
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const result = generateApiKeyWithMachine(machineId);
  const apiKey = {
    id: uuidv4(),
    name,
    key: result.key,
    machineId,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  db.run(
    `INSERT INTO apiKeys(id, key, name, machineId, isActive, createdAt) VALUES(?, ?, ?, ?, ?, ?)`,
    [apiKey.id, hashApiKey(apiKey.key), apiKey.name, apiKey.machineId, 1, apiKey.createdAt]
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
  const nextKey = data?.key ? hashApiKey(data.key) : row.key;
  db.run(
    `UPDATE apiKeys SET key = ?, name = ?, machineId = ?, isActive = ? WHERE id = ?`,
    [nextKey, name, machineId, isActive ? 1 : 0, id]
  );
  return {
    id,
    key: maskApiKey(nextKey),
    name,
    machineId,
    isActive,
    createdAt: row.createdAt,
  };
}

export async function deleteApiKey(id) {
  const db = await getAdapter();
  const res = db.run(`DELETE FROM apiKeys WHERE id = ?`, [id]);
  return (res?.changes ?? 0) > 0;
}

export async function validateApiKey(key) {
  if (!key) return false;
  const db = await getAdapter();
  const hash = hashApiKey(key);
  const row = db.get(`SELECT isActive FROM apiKeys WHERE key = ?`, [hash]);
  return Boolean(row && (row.isActive === 1 || row.isActive === true));
}
