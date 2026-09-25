"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Card, Button, Badge } from "@/shared/components";
import Modal, { ConfirmModal } from "@/shared/components/Modal";
import Input from "@/shared/components/Input";

export default function CloudSyncPage() {
  return (
    <Suspense fallback={<div className="text-text-muted text-sm">Memuat...</div>}>
      <CloudSyncContent />
    </Suspense>
  );
}

function CloudSyncContent() {
  const searchParams = useSearchParams();
  const [providers, setProviders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [webdavOpen, setWebdavOpen] = useState(false);
  const [webdavForm, setWebdavForm] = useState({ baseUrl: "", username: "", password: "" });
  const [restoreName, setRestoreName] = useState(null);
  const [deleteName, setDeleteName] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [pRes, fRes] = await Promise.all([
        fetch("/api/cloud", { cache: "no-store" }),
        fetch("/api/cloud/sync?provider=gdrive", { cache: "no-store" }),
      ]);
      if (pRes.ok) {
        const data = await pRes.json();
        setProviders(data.providers || []);
      }
      if (fRes.ok) {
        const data = await fRes.json();
        setFiles(data.files || []);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Surface OAuth callback result.
  useEffect(() => {
    const err = searchParams.get("error");
    const ok = searchParams.get("connected");
    if (err) setError(String(err));
    if (ok) {
      setInfo("Account connected successfully");
      load();
    }
  }, [searchParams, load]);

  const handleConnect = (providerId) => {
    setError("");
    setInfo("");
    window.location.href = `/api/cloud/oauth/start?provider=${providerId}`;
  };

  const handleDisconnect = async (providerId) => {
    setBusy(`disconnect-${providerId}`);
    setError("");
    try {
      const res = await fetch(`/api/cloud?provider=${providerId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to disconnect");
      } else {
        setInfo("Account disconnected");
      }
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleBackup = async (providerId) => {
    setBusy(`backup-${providerId}`);
    setError("");
    setInfo("");
    try {
      const res = await fetch(`/api/cloud/sync?provider=${providerId}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Backup failed");
      else setInfo(`Backup uploaded (${data.files} file${data.files === 1 ? "" : "s"})`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    if (!restoreName) return;
    setBusy("restore");
    setError("");
    setInfo("");
    try {
      const res = await fetch(`/api/cloud/sync?provider=gdrive`, { method: "PATCH" });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Restore failed");
      else setInfo(`Settings restored from cloud (saved ${data.restoredAt})`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
      setRestoreName(null);
    }
  };

  const handleDeleteFile = async () => {
    if (!deleteName) return;
    setBusy(`delete-${deleteName}`);
    setError("");
    try {
      const res = await fetch(
        `/api/cloud/sync?provider=gdrive&name=${encodeURIComponent(deleteName)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) setError(data.error || "Delete failed");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
      setDeleteName(null);
    }
  };

  const handleSaveWebdav = async () => {
    setBusy("webdav");
    setError("");
    try {
      const res = await fetch("/api/cloud", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: "webdav", ...webdavForm }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Failed to connect");
      else {
        setInfo("WebDAV account connected");
        setWebdavOpen(false);
      }
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cloud Storage</h1>
        <p className="text-text-muted text-sm mt-1">
          Sinkronkan pengaturan dan data ke penyimpanan cloud agar bisa diakses dari mana saja
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-600 dark:text-green-400">
          {info}
        </div>
      )}

      {/* Provider cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <Card padding="md" className="md:col-span-3 text-text-muted text-sm">
            Memuat provider...
          </Card>
        ) : (
          providers.map((p) => (
            <Card key={p.id} padding="md" className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="size-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${p.color}15` }}
                  >
                    <span className="material-symbols-outlined text-[20px]" style={{ color: p.color }}>
                      {p.icon}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{p.name}</h3>
                    {p.connected ? (
                      <Badge variant="success" size="sm" dot>Terhubung</Badge>
                    ) : p.supported ? (
                      <Badge variant="default" size="sm">Belum terhubung</Badge>
                    ) : (
                      <Badge variant="error" size="sm">Tidak didukung</Badge>
                    )}
                  </div>
                </div>
              </div>

              {p.connected && p.account && (
                <p className="text-xs text-text-muted truncate">{p.account}</p>
              )}
              {p.connected && p.lastBackupAt && (
                <p className="text-xs text-text-muted">
                  Backup terakhir: {new Date(p.lastBackupAt).toLocaleString("id-ID")}
                </p>
              )}
              {!p.supported && p.reason && (
                <p className="text-xs text-text-muted">{p.reason}</p>
              )}

              <div className="flex items-center gap-2 mt-auto">
                {p.supported && !p.connected && (
                  <Button
                    size="sm"
                    onClick={() => (p.id === "webdav" ? setWebdavOpen(true) : handleConnect(p.id))}
                  >
                    Hubungkan
                  </Button>
                )}
                {p.supported && p.connected && (
                  <>
                    <Button
                      size="sm"
                      icon="backup"
                      loading={busy === `backup-${p.id}`}
                      onClick={() => handleBackup(p.id)}
                    >
                      Backup
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busy === `disconnect-${p.id}`}
                      onClick={() => handleDisconnect(p.id)}
                    >
                      Putuskan
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Remote files */}
      <Card padding="md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">File di Google Drive</h2>
          <Button size="sm" variant="ghost" icon="refresh" onClick={load} loading={loading}>
            Muat ulang
          </Button>
        </div>

        {files.length === 0 ? (
          <p className="text-text-muted text-sm py-6 text-center">
            Belum ada file. Jalankan backup untuk mengunggah data.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {files.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border-subtle hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
              >
                <span className="material-symbols-outlined text-text-muted text-[18px]">
                  {f.name?.endsWith(".json") ? "description" : "database"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                  {f.modifiedTime && (
                    <p className="text-xs text-text-muted">
                      {new Date(f.modifiedTime).toLocaleString("id-ID")}
                      {f.size ? ` · ${(Number(f.size) / 1024).toFixed(1)} KB` : ""}
                    </p>
                  )}
                </div>
                {f.name === "multiver-settings.json" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busy === "restore"}
                    onClick={() => setRestoreName(f.name)}
                  >
                    Pulihkan
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => setDeleteName(f.name)}
                  className="text-text-muted hover:text-red-500 transition-colors p-1 rounded"
                  title="Hapus"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* WebDAV modal */}
      <Modal
        isOpen={webdavOpen}
        onClose={() => setWebdavOpen(false)}
        title="Hubungkan WebDAV"
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Server URL"
            placeholder="https://cloud.example.com/remote.php/dav/files/user"
            value={webdavForm.baseUrl}
            onChange={(e) => setWebdavForm((f) => ({ ...f, baseUrl: e.target.value }))}
          />
          <Input
            label="Username"
            placeholder="user"
            value={webdavForm.username}
            onChange={(e) => setWebdavForm((f) => ({ ...f, username: e.target.value }))}
          />
          <Input
            label="Password / App password"
            type="password"
            placeholder="••••••••"
            value={webdavForm.password}
            onChange={(e) => setWebdavForm((f) => ({ ...f, password: e.target.value }))}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setWebdavOpen(false)}>
              Batal
            </Button>
            <Button loading={busy === "webdav"} onClick={handleSaveWebdav}>
              Simpan
            </Button>
          </div>
        </div>
      </Modal>

      {/* Restore confirm */}
      <ConfirmModal
        isOpen={!!restoreName}
        onClose={() => setRestoreName(null)}
        onConfirm={handleRestore}
        title="Pulihkan pengaturan"
        message="Pengaturan lokal akan ditimpa dengan versi dari cloud. Lanjutkan?"
        confirmText="Pulihkan"
        variant="primary"
        loading={busy === "restore"}
      />

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={!!deleteName}
        onClose={() => setDeleteName(null)}
        onConfirm={handleDeleteFile}
        title="Hapus file"
        message={`${deleteName} akan dihapus permanen dari cloud. Lanjutkan?`}
        confirmText="Hapus"
        variant="danger"
        loading={busy?.startsWith?.("delete")}
      />
    </div>
  );
}
