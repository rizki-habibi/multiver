"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Input } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";

// Terminal CMD klasik: hitam pekat, teks terang, 1 baris = 1 event.
const LEVELS = ["all", "info", "success", "warning", "error", "debug"];
const SOURCES = ["all", "MITM", "KIRO", "GATEWAY", "ROUTER"];
const TOOLS = ["all", "kiro"];

// Warna ala terminal: tiap level punya warna tetap (ANSI-like).
const LEVEL_COLOR = {
  error: "text-red-400",
  warning: "text-amber-300",
  success: "text-green-400",
  info: "text-sky-300",
  debug: "text-violet-300",
};

// Keterangan status MITM & gateway dalam bahasa Indonesia.
const MITM_STATE_LABEL = {
  RUNNING: "Berjalan",
  DEGRADED: "Terdegradasi",
  ERROR: "Bermasalah",
  STARTING: "Memulai",
};

// Kode status HTTP dipetakan ke arti singkatnya (bukan sekadar angka).
const STATUS_HINT = {
  HTTP_400: "Permintaan tidak valid",
  HTTP_401: "Kunci/token salah atau kadaluarsa",
  HTTP_402: "Kuota habis / perlu pembayaran",
  HTTP_403: "Akses ditolak (token/izin)",
  HTTP_404: "Endpoint/model tidak ditemukan",
  HTTP_429: "Batas laju tercapai",
  HTTP_500: "Kesalahan server provider",
  HTTP_502: "Gateway provider mati/tidak sehat",
  HTTP_503: "Layanan provider sibuk",
  HTTP_504: "Provider kehabisan waktu",
  CLIENT_DISCONNECTED: "Klien terputus sebelum respons selesai",
  SUCCESS: "Sukses",
};

function hintFor(log) {
  if (log.status && STATUS_HINT[log.status]) return STATUS_HINT[log.status];
  const code = Number(String(log.status || "").replace(/^HTTP_/, ""));
  if (code >= 500) return "Kesalahan server provider";
  if (code === 429) return "Batas laju tercapai";
  if (code >= 400) return "Gagal sisi klien/provider";
  return null;
}

// Log mentah (semua baris, tanpa filter) dipakai ulang oleh filter lokal.
function lineText(l) {
  return [
    `[${new Date(l.timestamp).toLocaleTimeString("id-ID", { hour12: false })}]`,
    String(l.level || "info").toUpperCase(),
    `[${l.source || "MITM"}${l.tool ? `/${String(l.tool).toUpperCase()}` : ""}]`,
    l.requestId ? `[${l.requestId}]` : "",
    l.message || "",
    l.model ? `model=${l.model}` : "",
    l.mappedModel ? `mappedModel=${l.mappedModel}` : "",
    l.route ? `route=${l.route}` : "",
    l.status ? `status=${l.status}` : "",
  ].filter(Boolean).join(" ");
}

export default function ConsoleLogTab() {
  const [logs, setLogs] = useState([]);
  const [level, setLevel] = useState("all");
  const [source, setSource] = useState("all");
  const [tool, setTool] = useState("all");
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [status, setStatus] = useState({ mitm: "Tidak diketahui", gateway: "Tidak diketahui", kiro: false });
  const [selected, setSelected] = useState(null);
  const containerRef = useRef(null);

  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams({
      level, source, tool, search,
      limit: String(CONSOLE_LOG_CONFIG.maxLines || 200),
    });
    const res = await fetch(`/api/console-log?${params}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setLogs(data.logs || []);
  }, [level, source, tool, search]);

  const fetchStatus = useCallback(async () => {
    const res = await fetch("/api/mitm/kiro/diagnostics", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const gwOk = data?.checks?.find((c) => c.name?.includes("Gateway /health"))?.status === "PASS";
    setStatus({
      mitm: MITM_STATE_LABEL[data?.state] || "Tidak diketahui",
      gateway: gwOk ? "Online" : "Offline",
      // Bukti nyata interceptor bekerja: ada permintaan yang sudah disadap.
      kiro: Number(data?.stats?.totalRequests || 0) > 0,
    });
  }, []);

  useEffect(() => {
    fetchLogs().catch(() => { });
    fetchStatus().catch(() => { });
  }, [fetchLogs, fetchStatus]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      fetchLogs().catch(() => { });
      fetchStatus().catch(() => { });
    }, CONSOLE_LOG_CONFIG.pollIntervalMs || 1500);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchLogs, fetchStatus]);

  // Auto-scroll ke bawah hanya saat pengguna sudah di dekat bawah (CMD-style tail).
  const stickToBottom = useRef(true);
  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !autoRefresh || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [logs, autoRefresh]);

  // Filter lokal: paksa filter bekerja walau server mengabaikannya.
  const visibleLogs = useMemo(() => {
    let out = logs;
    if (level !== "all") out = out.filter((l) => String(l.level || "info").toLowerCase() === level);
    if (source !== "all") out = out.filter((l) => String(l.source || "").toUpperCase() === source);
    if (tool !== "all") out = out.filter((l) => String(l.tool || "").toLowerCase() === tool);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((l) => (lineText(l) + " " + String(l.reason || "") + " " + String(l.error || "")).toLowerCase().includes(q));
    }
    return out;
  }, [logs, level, source, tool, search]);

  const copyLogs = async () => {
    await navigator.clipboard.writeText(visibleLogs.map(lineText).join("\n"));
  };

  const clearLogs = async () => {
    await fetch("/api/console-log", { method: "DELETE" });
    setLogs([]);
    setSelected(null);
  };

  const statusBadge = useMemo(() => ({
    mitm: status.mitm === "Berjalan" ? "text-green-400" : status.mitm === "Terdegradasi" ? "text-amber-300" : "text-red-400",
    gateway: status.gateway === "Online" ? "text-green-400" : "text-red-400",
    kiro: status.kiro ? "text-green-400" : "text-red-400",
  }), [status]);

  return (
    <div className="flex flex-col gap-4">
      {status.mitm !== "Berjalan" || status.gateway !== "Online" ? (
        <Card className="p-3 flex items-start gap-2 bg-amber-500/10 border border-amber-500/30">
          <span className="material-symbols-outlined text-[16px] text-amber-600 mt-0.5 shrink-0">warning</span>
          <div className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
            <p className="font-semibold">Kiro belum terhubung ke Multiver</p>
            <p>
              Jalankan sebagai Administrator, mulai MITM di tab{" "}
              <a href="/dashboard/usage?tab=mitm" className="underline font-medium">Kiro MITM</a>, pastikan CA terpasang dan DNS Kiro aktif,
              lalu buka Kiro IDE. Cek{" "}
              <a href="/dashboard/usage?tab=diagnostics" className="underline font-medium">Diagnostik</a> bila masih gagal.
            </p>
          </div>
        </Card>
      ) : null}

      <Card className="p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Konsol Log</h2>
          <div className="flex items-center gap-3 text-xs">
            <span className={statusBadge.mitm}>● MITM: {status.mitm}</span>
            <span className={statusBadge.gateway}>● Gateway: {status.gateway}</span>
            <span className={statusBadge.kiro}>● Kiro: {status.kiro ? "Tersambung" : "Belum tersambung"}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="rounded border border-border bg-surface px-2 py-1 text-xs">
            {LEVELS.map((v) => <option key={v} value={v}>{v === "all" ? "SEMUA LEVEL" : v.toUpperCase()}</option>)}
          </select>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded border border-border bg-surface px-2 py-1 text-xs">
            {SOURCES.map((v) => <option key={v} value={v}>{v === "all" ? "SEMUA SUMBER" : v}</option>)}
          </select>
          <select value={tool} onChange={(e) => setTool(e.target.value)} className="rounded border border-border bg-surface px-2 py-1 text-xs">
            {TOOLS.map((v) => <option key={v} value={v}>{v === "all" ? "SEMUA ALAT" : v}</option>)}
          </select>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari log (pesan/model/error)…" className="max-w-xs" />
          <Button size="sm" onClick={() => fetchLogs().catch(() => { })}>Segarkan</Button>
          <Button size="sm" variant="ghost" onClick={() => setAutoRefresh((v) => !v)}>{autoRefresh ? "Jeda" : "Lanjut"}</Button>
          <Button size="sm" variant="ghost" onClick={copyLogs}>Salin</Button>
          <Button size="sm" variant="ghost" onClick={clearLogs}>Hapus Log</Button>
        </div>
      </Card>

      {/* Terminal hitam ala CMD: latar #0c0c0c, padding rapat, tanpa card border. */}
      <div className="rounded-lg border border-black/60 bg-[#0c0c0c] overflow-hidden shadow-lg">
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a1a1a] border-b border-black/60">
          <span className="text-[11px] font-mono text-gray-400">Multiver — Log Konsol Realtime ({visibleLogs.length} baris)</span>
          <span className="text-[11px] font-mono text-gray-600">{autoRefresh ? "● Langsung" : "◆ Dijeda"}</span>
        </div>
        <div
          ref={containerRef}
          onScroll={onScroll}
          className="h-[520px] overflow-auto p-3 font-mono text-[12px] leading-relaxed bg-[#0c0c0c] text-gray-200"
        >
          {visibleLogs.length === 0 ? (
            <p className="text-gray-500">Belum ada log. Kirim permintaan dari Kiro IDE untuk melihatnya di sini.</p>
          ) : visibleLogs.map((log, idx) => {
            const color = LEVEL_COLOR[String(log.level || "info").toLowerCase()] || "text-gray-200";
            const hint = hintFor(log);
            const detail = String(log.reason || log.error || "").trim();
            return (
              <button
                key={`${log.timestamp}-${idx}`}
                onClick={() => setSelected(log)}
                className="block w-full text-left px-1 py-0.5 hover:bg-white/5"
              >
                <div className="flex flex-wrap items-start gap-x-2">
                  <span className="text-gray-500 shrink-0">{new Date(log.timestamp).toLocaleTimeString("id-ID", { hour12: false })}</span>
                  <span className={`${color} font-semibold shrink-0`}>{String(log.level || "info").toUpperCase()}</span>
                  <span className="text-cyan-400 shrink-0">[{log.source}{log.tool ? `/${String(log.tool).toUpperCase()}` : ""}]</span>
                  {log.requestId ? <span className="text-gray-500 shrink-0">[{log.requestId}]</span> : null}
                  <span className={color}>{log.message}</span>
                </div>
                {hint ? <div className="text-gray-500 pl-2">↳ {hint}</div> : null}
                {detail ? <div className="text-red-300 pl-2 break-all whitespace-pre-wrap">↳ Sebab: {detail.slice(0, 360)}</div> : null}
                <div className="text-gray-600 pl-2">
                  {log.model ? `model=${log.model} ` : ""}
                  {log.mappedModel ? `mapped=${log.mappedModel} ` : ""}
                  {log.route ? `route=${log.route} ` : ""}
                  {log.status ? `status=${log.status} ` : ""}
                  {Number.isFinite(log.durationMs) ? `durasi=${log.durationMs}ms` : ""}
                </div>
                {log.error ? <div className="text-red-400 pl-2 break-all whitespace-pre-wrap">{String(log.error).slice(0, 400)}</div> : null}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">Rincian Log</h3>
          <div className="grid gap-1 text-xs">
            <div>ID Permintaan: {selected.requestId || "-"}</div>
            <div>Host: {selected.host || "-"}</div>
            <div>Target: {selected.target || "-"}</div>
            <div>Model: {selected.model || "-"}</div>
            <div>Alias: {selected.alias || "-"}</div>
            <div>Model Terpetakan: {selected.mappedModel || "-"}</div>
            <div>Rute: {selected.route || "-"}</div>
            <div>Gateway: {selected.gateway || "-"}</div>
            <div>Status: {selected.status || "-"}{hintFor(selected) ? ` — ${hintFor(selected)}` : ""}</div>
            <div>Durasi: {Number.isFinite(selected.durationMs) ? `${selected.durationMs}ms` : "-"}</div>
            <div>Sebab: {selected.reason || "-"}</div>
            <div>Error: {selected.error || "-"}</div>
          </div>
        </Card>
      )}
    </div>
  );
}
