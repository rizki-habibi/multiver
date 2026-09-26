"use client";

import { useState, useEffect } from "react";

const STATUS_ICON = {
  healthy: "🟢",
  error: "🔴",
  checking: "🟡",
  unknown: "⚪",
};

const STATUS_LABEL = {
  healthy: "Sehat",
  error: "Error",
  checking: "Memeriksa…",
  unknown: "Belum dicek",
};

export default function KeyValidationTab() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkingOne, setCheckingOne] = useState(null);
  const [results, setResults] = useState({});
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/providers/health");
        if (res.ok) {
          const data = await res.json();
          const conns = data.connections || [];
          setConnections(conns);
          const initial = {};
          for (const c of conns) {
            initial[c.id] = {
              status: c.status === "healthy" ? "healthy" : c.status === "error" ? "error" : "unknown",
              message: c.lastError || c.status || "",
              lastChecked: c.lastCheckedAt || null,
              latencyMs: null,
            };
          }
          setResults(initial);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  const runCheck = async (connectionId) => {
    setCheckingOne(connectionId);
    setResults((prev) => ({ ...prev, [connectionId]: { status: "checking", message: "Memeriksa…" } }));
    try {
      const res = await fetch("/api/providers/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const data = await res.json();
      const r = data.result || {};
      setResults((prev) => ({
        ...prev,
        [connectionId]: {
          status: r.ok ? "healthy" : "error",
          message: r.message || (r.ok ? "OK" : "Gagal"),
          lastChecked: new Date().toISOString(),
          latencyMs: r.latencyMs ?? null,
        },
      }));
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [connectionId]: { status: "error", message: e.message || "Request gagal" },
      }));
    } finally {
      setCheckingOne(null);
    }
  };

  const runCheckAll = async () => {
    setCheckingAll(true);
    setSummary(null);
    try {
      const res = await fetch("/api/providers/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkAll: true }),
      });
      const data = await res.json();
      const next = {};
      for (const r of data.results || []) {
        next[r.connectionId] = {
          status: r.ok ? "healthy" : "error",
          message: r.message || "",
          lastChecked: new Date().toISOString(),
          latencyMs: r.latencyMs ?? null,
        };
      }
      setResults((prev) => ({ ...prev, ...next }));
      setSummary(data.summary || null);
    } catch (e) {
      setSummary({ error: e.message });
    } finally {
      setCheckingAll(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-text-muted">Memuat koneksi…</p>;
  }

  if (connections.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        Belum ada koneksi provider. Tambahkan di halaman Penyedia terlebih dahulu.
      </p>
    );
  }

  const healthyCount = Object.values(results).filter((r) => r.status === "healthy").length;
  const errorCount = Object.values(results).filter((r) => r.status === "error").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={runCheckAll}
          disabled={checkingAll}
          className="px-4 py-1.5 text-sm rounded-lg bg-primary text-white hover:opacity-90 disabled:opacity-50"
        >
          {checkingAll ? "⏳ Memeriksa semua…" : "✓ Cek Semua Kunci"}
        </button>
        <span className="text-xs text-text-muted">
          {healthyCount} sehat · {errorCount} error · {connections.length} total
        </span>
        {summary && (
          <span className="text-xs text-text-muted">
            ({summary.healthy}/{summary.total} sehat{summary.durationMs ? ` dalam ${(summary.durationMs / 1000).toFixed(1)}s` : ""})
          </span>
        )}
      </div>

      <div className="grid gap-2">
        {connections.map((c) => {
          const r = results[c.id] || { status: "unknown", message: "" };
          return (
            <div
              key={c.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-[var(--surface)] text-sm"
            >
              <span className="text-base" title={STATUS_LABEL[r.status]}>{STATUS_ICON[r.status]}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-text-main truncate">
                  {c.name || c.id} <span className="text-xs text-text-muted font-normal">· {c.provider}</span>
                </p>
                <p className={`text-xs truncate ${r.status === "error" ? "text-red-500" : "text-text-muted"}`}>
                  {r.message || STATUS_LABEL[r.status]}
                  {r.latencyMs != null && ` · ${r.latencyMs}ms`}
                </p>
              </div>
              <span className="text-[11px] text-text-muted hidden sm:block">
                {r.lastChecked ? new Date(r.lastChecked).toLocaleTimeString("id-ID") : "—"}
              </span>
              <button
                onClick={() => runCheck(c.id)}
                disabled={checkingOne === c.id}
                className="px-3 py-1 text-xs rounded-lg bg-surface-2 hover:bg-surface-3 disabled:opacity-50"
              >
                {checkingOne === c.id ? "⏳" : "Cek"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
