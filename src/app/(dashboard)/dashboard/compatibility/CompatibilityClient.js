"use client";
import { useEffect, useMemo, useState } from "react";

const STATUS_STYLE = {
  SUPPORTED: { color: "#16a34a" },
  PARTIAL: { color: "#d97706" },
  UNSUPPORTED: { color: "#dc2626" },
  UNKNOWN: { color: "#6b7280" },
  ACTIVE: { color: "#16a34a" },
  DEPRECATED: { color: "#d97706" },
  HIDDEN: { color: "#6b7280" },
};

const COLUMNS = [
  { key: "name", label: "Provider" },
  { key: "sample_model", label: "Model Contoh" },
  { key: "model_count", label: "Jumlah Model" },
  { key: "openai_chat", label: "OpenAI Chat" },
  { key: "openai_responses", label: "OpenAI Responses" },
  { key: "anthropic_messages", label: "Anthropic Messages" },
  { key: "gemini", label: "Gemini" },
  { key: "streaming", label: "Streaming" },
  { key: "vision", label: "Vision" },
  { key: "tools", label: "Tools" },
  { key: "reasoning", label: "Reasoning" },
  { key: "json_mode", label: "JSON" },
  { key: "embeddings", label: "Embeddings" },
  { key: "quota", label: "Quota" },
  { key: "usage", label: "Usage" },
  { key: "mitm", label: "MITM" },
  { key: "status", label: "Status" },
];

export default function CompatibilityClient() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetch("/api/compatibility")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Gagal memuat compatibility matrix"))))
      .then((d) => setRows(d.matrix || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => rows.filter((r) => r.name?.toLowerCase().includes(filter.toLowerCase())),
    [rows, filter]
  );

  if (loading) return <div style={{ padding: 24 }}>Memuat compatibility matrix…</div>;
  if (error) return <div style={{ padding: 24, color: "#dc2626" }}>Error: {error}</div>;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Kompatibilitas</h1>
      <p style={{ color: "#6b7280", marginBottom: 16 }}>
        Matriks kemampuan tiap provider berdasarkan transport format dan kapabilitas model yang
        terdaftar di registry. Status diturunkan dari data adapter nyata, bukan klaim.
      </p>
      <input
        placeholder="Cari provider…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, marginBottom: 16, width: 260 }}
      />
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 13, minWidth: 1100 }}>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} style={{ textAlign: "left", padding: "8px 10px", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.provider}>
                {COLUMNS.map((c) => {
                  const v = r[c.key];
                  const style = STATUS_STYLE[v] || null;
                  return (
                    <td key={c.key} style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" }}>
                      {style ? <span style={{ color: style.color, fontWeight: 600 }}>{v}</span> : String(v ?? "-")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <div style={{ color: "#6b7280", marginTop: 12 }}>Tidak ada provider cocok.</div>}
    </div>
  );
}
