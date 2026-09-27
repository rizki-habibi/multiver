"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Input } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";

const LEVELS = ["all", "info", "success", "warning", "error", "debug"];
const SOURCES = ["all", "MITM", "KIRO", "GATEWAY", "ROUTER"];
const TOOLS = ["all", "kiro"];

function badgeClass(level) {
  switch (String(level || "").toLowerCase()) {
    case "success": return "bg-green-500/10 text-green-600 border-green-500/30";
    case "warning": return "bg-amber-500/10 text-amber-600 border-amber-500/30";
    case "error": return "bg-red-500/10 text-red-600 border-red-500/30";
    case "debug": return "bg-blue-500/10 text-blue-600 border-blue-500/30";
    default: return "bg-surface border-border text-text-main";
  }
}

export default function ConsoleLogClient() {
  const [logs, setLogs] = useState([]);
  const [visibleLogs, setVisibleLogs] = useState([]);
  const [level, setLevel] = useState("all");
  const [source, setSource] = useState("all");
  const [tool, setTool] = useState("all");
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [status, setStatus] = useState({ mitm: "Unknown", gateway: "Unknown" });
  const [selected, setSelected] = useState(null);
  const containerRef = useRef(null);

  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams({
      level,
      source,
      tool,
      search,
      limit: String(CONSOLE_LOG_CONFIG.maxLines || 100),
    });
    const res = await fetch(`/api/console-log?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setLogs(data.logs || []);
    setVisibleLogs(data.logs || []);
  }, [level, source, tool, search]);

  const fetchStatus = useCallback(async () => {
    const res = await fetch("/api/mitm/kiro/diagnostics", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setStatus({
      mitm: data?.state || "Unknown",
      gateway: data?.checks?.find((c) => c.name?.includes("Gateway /health"))?.status === "PASS" ? "Online" : "Offline",
    });
  }, []);

  useEffect(() => {
    fetchLogs().catch(() => { });
    fetchStatus().catch(() => { });
  }, [fetchLogs, fetchStatus]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => {
      fetchLogs().catch(() => { });
      fetchStatus().catch(() => { });
    }, CONSOLE_LOG_CONFIG.pollIntervalMs || 1500);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchLogs, fetchStatus]);

  useEffect(() => {
    if (!containerRef.current || !autoRefresh) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [logs, autoRefresh]);

  const copyLogs = async () => {
    const text = visibleLogs.map((l) => {
      const parts = [
        `[${new Date(l.timestamp).toLocaleTimeString("id-ID", { hour12: false })}]`,
        String(l.level || "info").toUpperCase(),
        `[${l.source || "MITM"}${l.tool ? `/${String(l.tool).toUpperCase()}` : ""}]`,
        l.requestId ? `[${l.requestId}]` : "",
        l.message || "",
        l.model ? `model=${l.model}` : "",
        l.mappedModel ? `mappedModel=${l.mappedModel}` : "",
        l.route ? `route=${l.route}` : "",
        l.status ? `status=${l.status}` : "",
      ].filter(Boolean);
      return parts.join(" ");
    }).join("\n");
    await navigator.clipboard.writeText(text);
  };

  const clearLogs = async () => {
    await fetch("/api/console-log", { method: "DELETE" });
    setLogs([]);
    setVisibleLogs([]);
    setSelected(null);
  };

  const clearDisplay = () => {
    setVisibleLogs([]);
    setSelected(null);
  };

  const statusBadge = useMemo(() => ({
    mitm: status.mitm === "RUNNING" ? "text-green-600" : status.mitm === "DEGRADED" ? "text-amber-600" : "text-red-600",
    gateway: status.gateway === "Online" ? "text-green-600" : "text-red-600",
  }), [status]);

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Log Konsol</h2>
          <div className="flex items-center gap-3 text-xs">
            <span className={statusBadge.mitm}>● MITM {status.mitm}</span>
            <span className={statusBadge.gateway}>● Gateway 20222 {status.gateway}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="rounded border border-border bg-surface px-2 py-1 text-xs">
            {LEVELS.map((v) => <option key={v} value={v}>{v.toUpperCase()}</option>)}
          </select>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded border border-border bg-surface px-2 py-1 text-xs">
            {SOURCES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={tool} onChange={(e) => setTool(e.target.value)} className="rounded border border-border bg-surface px-2 py-1 text-xs">
            {TOOLS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari log..." className="max-w-xs" />
          <Button size="sm" onClick={() => fetchLogs().catch(() => { })}>Refresh</Button>
          <Button size="sm" variant="ghost" onClick={() => setAutoRefresh((v) => !v)}>{autoRefresh ? "Pause" : "Resume"}</Button>
          <Button size="sm" variant="ghost" onClick={copyLogs}>Copy</Button>
          <Button size="sm" variant="ghost" onClick={clearDisplay}>Clear Display</Button>
          <Button size="sm" variant="ghost" onClick={clearLogs}>Clear Logs</Button>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div ref={containerRef} className="max-h-[520px] overflow-auto p-3 flex flex-col gap-2 font-mono text-xs">
          {visibleLogs.length === 0 ? <p className="text-text-muted">Belum ada log.</p> : visibleLogs.map((log, idx) => (
            <button
              key={`${log.timestamp}-${idx}`}
              onClick={() => setSelected(log)}
              className="text-left rounded border border-border p-2 hover:bg-surface/70"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span>{new Date(log.timestamp).toLocaleTimeString("id-ID", { hour12: false })}</span>
                <span className={`rounded border px-1.5 py-0.5 text-[10px] ${badgeClass(log.level)}`}>{String(log.level || "info").toUpperCase()}</span>
                <span>{log.source}</span>
                {log.tool ? <span>{String(log.tool).toUpperCase()}</span> : null}
                {log.requestId ? <span>[{log.requestId}]</span> : null}
              </div>
              <p className="mt-1">{log.message}</p>
              <p className="mt-1 text-text-muted">
                {log.model ? `model=${log.model} ` : ""}
                {log.mappedModel ? `mapped=${log.mappedModel} ` : ""}
                {log.route ? `route=${log.route} ` : ""}
                {log.status ? `status=${log.status} ` : ""}
                {Number.isFinite(log.durationMs) ? `duration=${log.durationMs}ms` : ""}
              </p>
              {log.error ? (
                <p className="mt-1 break-all whitespace-pre-wrap text-red-600 dark:text-red-400">
                  {String(log.error).slice(0, 400)}
                </p>
              ) : null}
              {log.meta?.upstreamBody ? (
                <p className="mt-1 break-all whitespace-pre-wrap text-amber-600 dark:text-amber-400">
                  {String(log.meta.upstreamBody).slice(0, 400)}
                </p>
              ) : null}
            </button>
          ))}
        </div>
      </Card>

      {selected && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">Detail Log</h3>
          <div className="grid gap-1 text-xs">
            <div>Request ID: {selected.requestId || "-"}</div>
            <div>Host: {selected.host || "-"}</div>
            <div>Target: {selected.target || "-"}</div>
            <div>Model: {selected.model || "-"}</div>
            <div>Alias: {selected.alias || "-"}</div>
            <div>Mapped Model: {selected.mappedModel || "-"}</div>
            <div>Route: {selected.route || "-"}</div>
            <div>Gateway: {selected.gateway || "-"}</div>
            <div>Status: {selected.status || "-"}</div>
            <div>Duration: {Number.isFinite(selected.durationMs) ? `${selected.durationMs}ms` : "-"}</div>
            <div>Error: {selected.error || "-"}</div>
          </div>
        </Card>
      )}
    </div>
  );
}
