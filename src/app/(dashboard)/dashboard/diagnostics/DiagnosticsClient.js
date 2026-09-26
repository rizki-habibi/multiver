"use client";
import { useCallback, useState } from "react";

const PASS_COLOR = "#16a34a";
const WARN_COLOR = "#d97706";
const FAIL_COLOR = "#dc2626";

export default function DiagnosticsClient() {
  const [checks, setChecks] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setChecks(null);
    setSummary(null);
    try {
      const res = await fetch("/api/mitm/kiro/diagnostics");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Diagnostik gagal");
      setChecks(data.checks || []);
      setSummary(data.summary || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const colorFor = (s) => (s === "PASS" ? PASS_COLOR : s === "WARN" ? WARN_COLOR : s === "FAIL" ? FAIL_COLOR : "#6b7280");

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Diagnostik Sistem</h1>
      <p style={{ color: "#6b7280", marginBottom: 16 }}>
        Pemeriksaan nyata kondisi runtime: port gateway, MITM engine, sertifikat CA, interceptor,
        forwarding, provider, dan logging. Status berasal dari pemeriksaan langsung, bukan boolean statis.
      </p>
      <button
        onClick={run}
        disabled={loading}
        style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, cursor: loading ? "wait" : "pointer" }}
      >
        {loading ? "Menjalankan…" : "Jalankan Diagnostik"}
      </button>

      {error && <div style={{ marginTop: 16, color: FAIL_COLOR }}>Error: {error}</div>}

      {summary && (
        <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
          {["PASS", "WARN", "FAIL"].map((s) => (
            <div key={s} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 18px", minWidth: 110 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: colorFor(s) }}>{summary[s] ?? 0}</div>
              <div style={{ color: "#6b7280", fontSize: 12 }}>{s}</div>
            </div>
          ))}
          {summary.state && (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 18px" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: colorFor(summary.state === "RUNNING" ? "PASS" : summary.state === "DEGRADED" ? "WARN" : "FAIL") }}>
                {summary.state}
              </div>
              <div style={{ color: "#6b7280", fontSize: 12 }}>MITM State</div>
            </div>
          )}
        </div>
      )}

      {checks && checks.length > 0 && (
        <div style={{ marginTop: 20, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
          {checks.map((c, i) => (
            <div key={i} style={{ padding: "12px 16px", borderBottom: i < checks.length - 1 ? "1px solid #f3f4f6" : "none", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ fontWeight: 700, color: colorFor(c.status), minWidth: 52 }}>{c.status}</span>
              <div>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                {c.detail && <div style={{ color: "#6b7280", fontSize: 13 }}>{c.detail}</div>}
                {c.hint && <div style={{ color: WARN_COLOR, fontSize: 13 }}>Saran: {c.hint}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {checks && checks.length === 0 && !error && (
        <div style={{ marginTop: 16, color: "#6b7280" }}>Tidak ada hasil pemeriksaan.</div>
      )}
    </div>
  );
}
