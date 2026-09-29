"use client";

import { useCallback, useEffect, useState } from "react";

const STATUS = {
  VERIFIED: "Terverifikasi",
  CONFIGURED: "Terkonfigurasi",
  CATALOG_ONLY: "Katalog saja",
  INVALID_CREDENTIAL: "Kredensial invalid",
  NO_CREDENTIAL: "Tanpa kredensial",
  ORPHAN: "Data yatim",
  SUSPENDED: "Ditangguhkan",
  NO_MODEL: "Model tidak ditemukan",
  UNKNOWN: "Belum diketahui",
};

export default function ProviderIntelligencePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const scan = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/provider-intelligence?deep=1", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Pemeriksaan gagal");
      setData(json);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { scan(); }, [scan]);

  async function action(name, ids = []) {
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/provider-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: name, ids }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Tindakan gagal");
      await scan();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setWorking(false);
    }
  }

  const providers = data?.providers || [];
  const invalid = providers.filter(p => ["INVALID_CREDENTIAL", "SUSPENDED", "ORPHAN"].includes(p.classification));
  const orphans = providers.filter(p => p.classification === "ORPHAN");

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-main">Kuota & Data AI</h1>
          <p className="text-sm text-text-muted">
            Verifikasi provider, Base URL, kredensial, model asli, dan kuota tanpa menebak data.
          </p>
        </div>
        <button onClick={scan} disabled={loading || working} className="rounded-lg border border-border-subtle px-4 py-2 text-sm hover:bg-surface-subtle disabled:opacity-50">
          {loading ? "Memeriksa..." : "Periksa Semua"}
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          ["Total", data?.summary?.total ?? 0],
          ["Aktif", data?.summary?.active ?? 0],
          ["Terverifikasi", data?.summary?.verified ?? 0],
          ["Kuota diketahui", data?.summary?.quotaKnown ?? 0],
          ["Kredensial bermasalah", data?.summary?.invalid ?? 0],
          ["Data yatim", data?.summary?.orphan ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border-subtle bg-vibrancy p-4">
            <div className="text-xs text-text-muted">{label}</div>
            <div className="mt-1 text-2xl font-semibold text-text-main">{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => action("disable-invalid", invalid.map(p => p.connectionId))}
          disabled={working || invalid.length === 0}
          className="rounded-lg border border-amber-300 px-3 py-2 text-sm hover:bg-amber-50 disabled:opacity-50"
        >
          Nonaktifkan kredensial bermasalah ({invalid.length})
        </button>
        <button
          onClick={() => action("delete-orphans", orphans.map(p => p.connectionId))}
          disabled={working || orphans.length === 0}
          className="rounded-lg border border-red-300 px-3 py-2 text-sm hover:bg-red-50 disabled:opacity-50"
        >
          Hapus data yatim ({orphans.length})
        </button>
        <button
          onClick={() => action("delete-zed")}
          disabled={working}
          className="rounded-lg border border-red-300 px-3 py-2 text-sm hover:bg-red-50 disabled:opacity-50"
        >
          Hapus data Zed
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border-subtle bg-vibrancy">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="border-b border-border-subtle text-left text-xs text-text-muted">
              <tr>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Protokol / Base URL</th>
                <th className="px-4 py-3">Kredensial</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Kuota</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.connectionId} className="border-b border-border-subtle last:border-0">
                  <td className="px-4 py-4 align-top">
                    <div className="font-semibold text-text-main">{p.providerName}</div>
                    <div className="text-xs text-text-muted">{p.connectionName}</div>
                    <div className="mt-1 text-[11px] text-text-muted">{p.provider}</div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="font-medium">{p.protocol}</div>
                    <div className="max-w-[260px] truncate text-xs text-text-muted" title={p.baseUrl || ""}>{p.baseHost || "Base URL tidak diketahui"}</div>
                  </td>
                  <td className="px-4 py-4 align-top text-xs">
                    <div>{p.credential.source}</div>
                    <div className="text-text-muted">
                      API Key {p.credential.hasApiKey ? "ada" : "tidak"} · OAuth {p.credential.hasAccessToken ? "ada" : "tidak"}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="font-medium">{p.liveModels.length || p.models.length} model</div>
                    <div className="max-w-[300px] text-xs text-text-muted">
                      {p.liveModels.length ? "LIVE: " + p.liveModels.slice(0, 3).join(", ") : p.models.slice(0, 3).map(m => m.id + " [" + m.source + "]").join(", ")}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top text-xs">
                    {p.quota?.exact ? (
                      <div>
                        <div className="font-medium">Provider API</div>
                        <div>{Object.values(p.quota.quotas || {}).filter(q => q?.remainingPercentage != null).slice(0, 3).map((q, i) => <div key={i}>{Math.round(q.remainingPercentage)}% tersisa</div>)}</div>
                      </div>
                    ) : p.rateLimits?.exact ? (
                      <div>
                        <div>Request: {p.rateLimits.requests?.remaining ?? "?"} / {p.rateLimits.requests?.limit ?? "?"}</div>
                        <div>Token: {p.rateLimits.tokens?.remaining ?? "?"} / {p.rateLimits.tokens?.limit ?? "?"}</div>
                      </div>
                    ) : (
                      <span className="text-text-muted">Tidak tersedia / UNKNOWN</span>
                    )}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <span className="rounded-full border border-border-subtle px-2 py-1 text-xs">{STATUS[p.classification] || p.classification}</span>
                    {p.lastErrorType !== "UNKNOWN" && <div className="mt-1 max-w-[220px] text-[11px] text-text-muted">{p.lastErrorType}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && providers.length === 0 && <div className="p-8 text-center text-sm text-text-muted">Belum ada koneksi provider.</div>}
      </div>

      <div className="rounded-xl border border-border-subtle bg-vibrancy p-4 text-xs text-text-muted">
        <strong className="text-text-main">Aturan data:</strong> LIVE berarti model ditemukan langsung dari endpoint provider. REGISTRY hanya katalog Multiver. Kuota UNKNOWN tidak ditebak. 402/429 tidak otomatis dianggap data palsu; kredensial hanya dinonaktifkan jika ada bukti invalid, ditangguhkan, atau node kompatibel sudah yatim.
      </div>
    </div>
  );
}
