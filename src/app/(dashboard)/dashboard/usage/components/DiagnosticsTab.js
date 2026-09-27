"use client";

import { useCallback, useEffect, useState } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";

const COLOR = { PASS: "#16a34a", WARN: "#d97706", FAIL: "#dc2626" };

export default function DiagnosticsTab() {
  const [checks, setChecks] = useState([]);
  const [state, setState] = useState(null);
  const [overall, setOverall] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mitm/kiro/diagnostics", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Diagnostik gagal");
      setChecks(data.checks || []);
      setState(data.state || null);
      setOverall(data.overall || null);
      setSummary(data.summary || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { run(); }, [run]);

  return (
    <div className="flex flex-col gap-4">
      <Card padding="md" className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">Diagnostik Sistem</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Pemeriksaan nyata runtime: port gateway, MITM engine, CA, DNS, provider, logging.
          </p>
        </div>
        <Button size="sm" onClick={run} disabled={loading}>
          {loading ? "Menjalankan…" : "Jalankan Diagnostik"}
        </Button>
      </Card>

      {error && (
        <Card padding="sm" className="border-red-500/30 bg-red-500/5 text-sm text-red-600 dark:text-red-400">
          Error: {error}
        </Card>
      )}

      {(state || overall) && (
        <div className="flex flex-wrap gap-3">
          {[
            { label: "MITM State", value: state, color: state === "RUNNING" ? COLOR.PASS : state === "DEGRADED" ? COLOR.WARN : COLOR.FAIL },
            { label: "Overall", value: overall, color: COLOR[overall] || "#6b7280" },
          ].map((b) => b.value ? (
            <Card key={b.label} padding="sm" className="min-w-[140px]">
              <div className="text-xl font-bold" style={{ color: b.color }}>{b.value}</div>
              <div className="text-xs text-text-muted">{b.label}</div>
            </Card>
          ) : null)}
          {summary && (
            <Card padding="sm" className="flex-1 min-w-[220px]">
              <div className="text-xs text-text-muted mb-1">Ringkasan</div>
              <div className="text-sm">{summary}</div>
            </Card>
          )}
        </div>
      )}

      <Card padding="none" className="overflow-hidden">
        {checks.length === 0 && !loading ? (
          <div className="p-6 text-sm text-text-muted text-center">Belum ada hasil pemeriksaan.</div>
        ) : checks.map((c, i) => (
          <div
            key={`${c.name}-${i}`}
            className={`flex gap-3 p-3 items-start ${i < checks.length - 1 ? "border-b border-border-subtle" : ""}`}
          >
            <span
              className="font-bold text-xs px-2 py-1 rounded shrink-0"
              style={{ color: COLOR[c.status] || "#6b7280", background: `${COLOR[c.status] || "#6b7280"}1a` }}
            >
              {c.status}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{c.name} <span className="text-[10px] text-text-muted uppercase ml-1">{c.category}</span></div>
              {c.reason && <div className="text-xs text-text-muted mt-0.5 break-all">{c.reason}</div>}
              {c.detail && <div className="text-xs text-text-muted mt-0.5 break-all">{c.detail}</div>}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
