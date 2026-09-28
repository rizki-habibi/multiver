"use client";

import { useState, useEffect, useCallback } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";
import Drawer from "@/shared/components/Drawer";
import { cn } from "@/shared/utils/cn";

const PERIOD_MS = {
  today: 24 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "60d": 60 * 24 * 60 * 60 * 1000,
  all: 0,
};

export default function ConversationsClient({ status = null, period = "today" }) {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      if (status) params.append("status", status);
      const span = PERIOD_MS[period] || 0;
      if (span > 0) {
        const since = new Date(Date.now() - span).toISOString();
        params.append("startDate", since);
      }
      const res = await fetch(`/api/usage/conversations?${params}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setRows(data.rows || []);
      setPagination((prev) => ({ ...prev, ...data.pagination }));
    } catch (error) {
      console.error("Gagal memuat riwayat percakapan:", error);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, status, period]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleView = (row) => {
    setSelected(row);
    setIsDrawerOpen(true);
  };

  const handlePageChange = (newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  const fmt = (n) => new Intl.NumberFormat().format(n || 0);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-black/5 dark:border-white/5">
                <th className="text-left p-4 text-sm font-semibold text-text-main">Waktu</th>
                <th className="text-left p-4 text-sm font-semibold text-text-main">Prompt</th>
                <th className="text-left p-4 text-sm font-semibold text-text-main">Model</th>
                <th className="text-left p-4 text-sm font-semibold text-text-main">Penyedia</th>
                <th className="text-right p-4 text-sm font-semibold text-text-main">Token</th>
                <th className="text-right p-4 text-sm font-semibold text-text-main">Latensi</th>
                <th className="text-left p-4 text-sm font-semibold text-text-main">Status</th>
                <th className="text-center p-4 text-sm font-semibold text-text-main">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-text-muted">
                    <div className="flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                      Memuat…
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-text-muted">
                    Belum ada percakapan tercatat. Kirim permintaan dari Kiro IDE atau klien lain.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr
                    key={`${row.id}-${index}`}
                    className="border-b border-black/5 dark:border-white/5 last:border-b-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="whitespace-nowrap p-4 text-sm text-text-main">
                      {new Date(row.timestamp).toLocaleString("id-ID")}
                    </td>
                    <td className="max-w-[320px] p-4 text-sm text-text-main">
                      <div className="flex flex-col gap-1">
                        <span className="line-clamp-2 break-words text-text-main">{row.prompt || "-"}</span>
                        {row.response ? (
                          <span className="line-clamp-1 break-words text-xs text-text-muted">↳ {row.response}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="max-w-[180px] truncate p-4 font-mono text-sm text-text-main" title={row.model}>
                      {row.model}
                    </td>
                    <td className="max-w-[140px] truncate p-4 text-sm text-text-main" title={row.provider}>
                      {row.provider}
                    </td>
                    <td className="p-4 text-right text-sm font-mono text-text-main">
                      {fmt(row.tokens?.total_tokens || (row.tokens?.prompt_tokens || 0) + (row.tokens?.completion_tokens || 0))}
                    </td>
                    <td className="p-4 text-right text-sm font-mono text-text-muted">
                      {row.latency?.total ? `${row.latency.total}ms` : "-"}
                    </td>
                    <td className="p-4">
                      <span
                        className={cn(
                          "text-xs font-bold px-2 py-0.5 rounded",
                          row.status === "success"
                            ? "bg-green-500/15 text-green-600"
                            : "bg-red-500/15 text-red-600"
                        )}
                      >
                        {row.status === "success" ? "Sukses" : "Gagal"}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <Button variant="outline" size="sm" onClick={() => handleView(row)}>
                        Detail
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && rows.length > 0 && (
          <div className="flex items-center justify-between border-t border-black/5 p-3 text-xs text-text-muted dark:border-white/5">
            <span>
              Halaman {pagination.page} dari {Math.max(pagination.totalPages, 1)} · {fmt(pagination.totalItems)} catatan
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => handlePageChange(pagination.page - 1)}
              >
                ← Sebelumnya
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => handlePageChange(pagination.page + 1)}
              >
                Berikutnya →
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Rincian Percakapan"
        width="lg"
      >
        {selected && (
          <div className="space-y-6">
            <div className="grid min-w-0 grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div>
                <span className="text-text-muted">Waktu:</span>{" "}
                <span className="text-text-main">{new Date(selected.timestamp).toLocaleString("id-ID")}</span>
              </div>
              <div>
                <span className="text-text-muted">Penyedia:</span>{" "}
                <span className="text-text-main font-medium">{selected.provider}</span>
              </div>
              <div>
                <span className="text-text-muted">Model:</span>{" "}
                <span className="text-text-main font-mono">{selected.model}</span>
              </div>
              <div>
                <span className="text-text-muted">Status:</span>{" "}
                <span className={selected.status === "success" ? "font-medium text-green-600" : "font-medium text-red-600"}>
                  {selected.status === "success" ? "Sukses" : "Gagal"}
                </span>
              </div>
              <div>
                <span className="text-text-muted">Token:</span>{" "}
                <span className="text-text-main font-mono">
                  {fmt(selected.tokens?.prompt_tokens || 0)} masuk / {fmt(selected.tokens?.completion_tokens || 0)} keluar
                </span>
              </div>
              <div>
                <span className="text-text-muted">Latensi:</span>{" "}
                <span className="text-text-main font-mono">
                  TTFT {selected.latency?.ttft || 0}ms / Total {selected.latency?.total || 0}ms
                </span>
              </div>
            </div>

            {selected.params && Object.keys(selected.params).length > 0 && (
              <div className="rounded-lg border border-black/5 p-4 dark:border-white/5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-text-muted">tune</span>
                  <span className="text-sm font-semibold text-text-main">Parameter</span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {Object.entries(selected.params).map(([k, v]) => (
                    <span key={k} className="rounded bg-black/5 px-2 py-0.5 font-mono dark:bg-white/5">
                      {k}: {String(v)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-main opacity-70">
                  Pesan Pengguna
                </h4>
                <pre className="max-h-[200px] max-w-full overflow-auto rounded-lg border border-black/5 bg-black/5 p-3 font-mono text-xs text-text-main dark:border-white/5 dark:bg-white/5 sm:p-4">
                  {selected.prompt || "[Kosong]"}
                </pre>
              </div>

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-main opacity-70">
                  Respons AI
                </h4>
                <pre className="max-h-[300px] max-w-full overflow-auto rounded-lg border border-black/5 bg-black/5 p-3 font-mono text-xs text-text-main dark:border-white/5 dark:bg-white/5 sm:p-4">
                  {selected.response || "[Tidak ada respons]"}
                </pre>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
