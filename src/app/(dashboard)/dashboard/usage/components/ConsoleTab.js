"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const LEVELS = ["ALL", "INFO", "WARN", "ERROR"];

const LEVEL_COLOR = {
  INFO: "text-blue-500",
  WARN: "text-amber-500",
  ERROR: "text-red-500",
};

function LogRow({ entry }) {
  const level = entry.level || entry.status || "INFO";
  return (
    <div className="flex gap-2 px-2 py-0.5 font-mono text-[11px] leading-relaxed hover:bg-surface-2 whitespace-nowrap">
      <span className="text-text-muted shrink-0">{entry.ts}</span>
      <span className={`shrink-0 w-14 ${LEVEL_COLOR[level] || "text-text-main"}`}>{level}</span>
      <span className="text-purple-400 shrink-0 w-16 text-right">[{entry.category}]</span>
      <span className="text-text-main">{entry.message}</span>
    </div>
  );
}

export default function ConsoleTab() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);
  const containerRef = useRef(null);
  const pausedRef = useRef(false);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const res = await fetch("/api/logs?limit=200");
        if (res.ok && mounted) {
          const data = await res.json();
          setLogs(data.logs || []);
        }
      } catch { /* ignore */ }
    })();

    const es = new EventSource("/api/logs/stream");
    es.onopen = () => { if (mounted) setConnected(true); };
    es.onerror = () => { if (mounted) setConnected(false); };
    es.onmessage = (event) => {
      if (!mounted || pausedRef.current) return;
      try {
        const entry = JSON.parse(event.data);
        setLogs((prev) => {
          const next = [...prev, entry];
          return next.length > 1000 ? next.slice(-1000) : next;
        });
      } catch { /* skip malformed */ }
    };

    return () => { mounted = false; es.close(); };
  }, []);

  useEffect(() => {
    if (!autoScroll || !containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [logs, autoScroll]);

  const handleClear = useCallback(() => setLogs([]), []);

  const handleDownload = useCallback(() => {
    const text = logs
      .map((e) => `${e.ts} [${e.category}] ${e.level || e.status || "INFO"} ${e.message}`)
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `multiver-console-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs]);

  const visible = logs.filter((e) => {
    if (filter !== "ALL" && e.level !== filter && e.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return e.message?.toLowerCase().includes(q) ||
        (e.category || "").toLowerCase().includes(q) ||
        (e.requestId || "").toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <span className={`inline-block w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-xs text-text-muted">{connected ? "realtime" : "terputus"}</span>
        </div>
        <div className="flex gap-1">
          {LEVELS.map((lv) => (
            <button
              key={lv}
              onClick={() => setFilter(lv)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                filter === lv ? "bg-primary text-white" : "bg-surface-2 text-text-muted hover:text-text-main"
              }`}
            >
              {lv}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Cari: teks / kategori / request id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[160px] px-3 py-1 text-xs rounded-lg bg-surface-2 border border-border text-text-main placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button onClick={() => setPaused((p) => !p)} className="px-3 py-1 text-xs rounded-lg bg-surface-2 hover:bg-surface-3">
          {paused ? "▶ Lanjut" : "⏸ Jeda"}
        </button>
        <button onClick={() => setAutoScroll((a) => !a)} className="px-3 py-1 text-xs rounded-lg bg-surface-2 hover:bg-surface-3">
          {autoScroll ? "↓ Auto" : "↓ Manual"}
        </button>
        <button onClick={handleDownload} className="px-3 py-1 text-xs rounded-lg bg-surface-2 hover:bg-surface-3">⬇ Unduh</button>
        <button onClick={handleClear} className="px-3 py-1 text-xs rounded-lg bg-surface-2 hover:bg-surface-3">🗑 Bersihkan</button>
      </div>

      {/* Terminal */}
      <div
        ref={containerRef}
        className="h-[calc(100vh-340px)] min-h-[300px] overflow-y-auto rounded-lg border border-border bg-[#0d1117] custom-scrollbar"
      >
        {visible.length === 0 ? (
          <div className="flex h-full items-center justify-center text-text-muted text-sm">
            Belum ada log. Kirim request ke endpoint Multiver untuk melihatnya di sini.
          </div>
        ) : (
          visible.map((entry, i) => <LogRow key={entry.seq ?? i} entry={entry} />)
        )}
      </div>

      <p className="text-[11px] text-text-muted">
        {visible.length} baris ditampilkan (dari {logs.length} di buffer). Secret otomatis di-redact di sisi server.
      </p>
    </div>
  );
}
