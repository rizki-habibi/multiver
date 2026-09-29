"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG, UPDATER_CONFIG } from "@/shared/constants/config";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import Button from "./Button";
import { ConfirmModal } from "./Modal";

const navItems = [
  { href: "/dashboard/endpoint", label: "Titik Akhir & Kunci", icon: "api" },
  { href: "/dashboard/providers", label: "Penyedia", icon: "dns" },
  { href: "/dashboard/combos", label: "Kombinasi & Adaptor Vision", icon: "layers" },
  { href: "/dashboard/conversations", label: "Riwayat Percakapan", icon: "chat" },
  { href: "/dashboard/usage", label: "Penggunaan", icon: "bar_chart" },
  { href: "/dashboard/provider-intelligence", label: "Kuota & Data AI", icon: "monitoring" },
  { href: "/dashboard/token-saver", label: "Penghemat Token", icon: "savings" },
];

const debugItems = [
  { href: "/dashboard/translator", label: "Penerjemah", icon: "translate" },
];




const systemItems = [
  { href: "/dashboard/cloud", label: "Penyimpanan Awan", icon: "cloud" },
];

export default function Sidebar({ onClose }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [shutdownCountdown, setShutdownCountdown] = useState(0);
  const [enableTranslator, setEnableTranslator] = useState(false);
  const [autoUpdating, setAutoUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);
  const { copied, copy } = useCopyToClipboard(2000);

  const INSTALL_CMD = UPDATER_CONFIG.installCmdLatest;
  const STATUS_URL = `http://127.0.0.1:${UPDATER_CONFIG.statusPort}/update/status`;

  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => { if (data.enableTranslator) setEnableTranslator(true); })
      .catch(() => { });
  }, []);

  // Lazy check for new npm version on mount
  useEffect(() => {
    fetch("/api/version")
      .then(res => res.json())
      .then(data => { if (data.hasUpdate) setUpdateInfo(data); })
      .catch(() => { });
  }, []);

  const isActive = (href) => {
    // Operational items use ?tab=… — match base path + tab so the menu actually
    // highlights instead of silently falling back to Penggunaan.
    const tab = searchParams?.get("tab");
    const queryIdx = href.indexOf("?");
    if (queryIdx >= 0) {
      return href.slice(0, queryIdx) === pathname && href.slice(queryIdx + 1).split("=")[1] === tab;
    }
    if (href === "/dashboard/endpoint") {
      return pathname === "/dashboard" || pathname.startsWith("/dashboard/endpoint");
    }
    if (href === "/dashboard/conversations") {
      return pathname.startsWith("/dashboard/conversations");
    }
    return pathname.startsWith(href);
  };

  // Open manual update panel (no countdown yet — user must click Copy to trigger shutdown)
  const handleUpdate = () => {
    setShowUpdateModal(false);
    setIsUpdating(true);
  };

  // Triggered by Copy button inside ManualUpdatePanel: copy + countdown + shutdown
  const handleCopyAndShutdown = async () => {
    try { await navigator.clipboard.writeText(INSTALL_CMD); } catch { /* clipboard blocked */ }
    copy(INSTALL_CMD);
    let remaining = UPDATER_CONFIG.shutdownCountdownSec;
    setShutdownCountdown(remaining);
    const timer = setInterval(() => {
      remaining -= 1;
      setShutdownCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        fetch("/api/version/shutdown", { method: "POST" }).catch(() => { });
        setIsDisconnected(true);
      }
    }, 1000);
    return () => clearInterval(timer);
  };

  const handleCancelUpdate = () => {
    setIsUpdating(false);
    setShutdownCountdown(0);
  };

  // 1-klik auto-install: POST /api/version/update → spawn detached updater,
  // server mati, npm i -g jalan sendiri, relaunch otomatis. Browser poll
  // status server di :statusPort selama server utama mati.
  const handleAutoUpdate = async () => {
    setShowUpdateModal(false);
    setAutoUpdating(true);
    setUpdateStatus({ phase: "starting" });
    try {
      await fetch("/api/version/update", { method: "POST" });
    } catch { /* expected: server exits mid-request */ }
    // Server akan mati ~500ms setelahnya; mulai poll status updater.
    setTimeout(() => pollUpdateStatus(), 800);
  };

  const pollUpdateStatus = () => {
    let pollTimer = null;
    const tick = async () => {
      try {
        const res = await fetch(STATUS_URL, { cache: "no-store" });
        const data = await res.json();
        setUpdateStatus(data);
        if (data?.done) {
          clearInterval(pollTimer);
          // App baru direlaunch oleh updater; tunggu port hidup lalu reload.
          setTimeout(() => globalThis.location.reload(), 4000);
        }
      } catch {
        // Status server belum up atau sudah tutup — coba lagi di tick berikutnya.
      }
    };
    tick();
    pollTimer = setInterval(tick, UPDATER_CONFIG.statusPollIntervalMs);
  };

  // Note: legacy updater poll removed. New flow: copy install cmd + shutdown server,
  // user runs the command manually in another terminal.


  return (
    <>
      <aside className="flex w-72 flex-col border-r border-border-subtle bg-vibrancy backdrop-blur-xl transition-colors duration-300 min-h-full">
        {/* Traffic lights */}
        <div className="flex items-center gap-2 px-6 pt-5 pb-2">
          <div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
          <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
          <div className="w-3 h-3 rounded-full bg-[#27C93F]" />
        </div>

        {/* Logo */}
        <div className="px-6 py-4 flex flex-col gap-2">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="flex items-center justify-center size-9 rounded-[10px] bg-gradient-to-br from-brand-500 to-brand-700 shadow-[var(--shadow-warm)]">
              <span className="material-symbols-outlined text-white text-[20px]">hub</span>
            </div>
            <div className="flex flex-col">
              <h1 className="text-lg font-semibold tracking-tight text-text-main">
                {APP_CONFIG.name}
              </h1>
              <span className="text-xs text-text-muted">v{APP_CONFIG.version}</span>
            </div>
          </Link>
          {updateInfo && (
            <div className="flex flex-col gap-1.5 rounded p-1 -m-1">
              <span className="text-xs font-semibold text-green-600 dark:text-amber-500">
                ↑ Versi baru tersedia: v{updateInfo.latestVersion}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAutoUpdate}
                  disabled={autoUpdating}
                  className="px-2 py-1 rounded bg-green-600 hover:bg-green-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-progress"
                >
                  {autoUpdating ? "Menginstal…" : "Pasang & Mulai Ulang"}
                </button>
                <button
                  onClick={() => setShowUpdateModal(true)}
                  disabled={autoUpdating}
                  className="px-2 py-1 rounded border border-green-600/40 dark:border-amber-500/40 text-green-700 dark:text-amber-400 text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-60"
                >
                  Manual
                </button>
                <button
                  onClick={() => copy(INSTALL_CMD)}
                  title="Salin perintah instalasi"
                  className="flex-1 text-left hover:opacity-80 transition-opacity cursor-pointer min-w-0"
                >
                  <code className="block text-[10px] text-green-600/80 dark:text-amber-400/70 font-mono truncate">
                    {copied ? "✓ disalin!" : INSTALL_CMD}
                  </code>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-2 space-y-0.5 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-1 rounded-lg transition-all group",
                isActive(item.href)
                  ? "bg-primary/10 text-primary"
                  : "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
            >
              <span
                className={cn(
                  "material-symbols-outlined text-[18px]",
                  isActive(item.href) ? "fill-1" : "group-hover:text-primary transition-colors"
                )}
              >
                {item.icon}
              </span>
              <span className="text-[13px] font-medium">{item.label}</span>
            </Link>
          ))}

          {/* System section */}
          <div className="pt-3 mt-2 space-y-0.5">
            <p className="px-4 text-xs font-semibold text-text-muted/60 uppercase tracking-wider mb-2">
              Sistem
            </p>

            {systemItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-1 rounded-lg transition-all group",
                  isActive(item.href)
                    ? "bg-primary/10 text-primary"
                    : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                )}
              >
                <span
                  className={cn(
                    "material-symbols-outlined text-[18px]",
                    isActive(item.href) ? "fill-1" : "group-hover:text-primary transition-colors"
                  )}
                >
                  {item.icon}
                </span>
                <span className="text-[13px] font-medium">{item.label}</span>
              </Link>
            ))}

            {/* Debug items (inside System section, before Settings) */}
            {debugItems.map((item) => {
              const show = item.href !== "/dashboard/translator" || enableTranslator;
              return show ? (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 px-3 py-1 rounded-lg transition-all group",
                    isActive(item.href)
                      ? "bg-primary/10 text-primary"
                      : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                  )}
                >
                  <span
                    className={cn(
                      "material-symbols-outlined text-[18px]",
                      isActive(item.href) ? "fill-1" : "group-hover:text-primary transition-colors"
                    )}
                  >
                    {item.icon}
                  </span>
                  <span className="text-[13px] font-medium">{item.label}</span>
                </Link>
              ) : null;
            })}

            {/* Settings */}
            <Link
              href="/dashboard/profile"
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-1 rounded-lg transition-all group",
                isActive("/dashboard/profile")
                  ? "bg-primary/10 text-primary"
                  : "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
            >
              <span
                className={cn(
                  "material-symbols-outlined text-[18px]",
                  isActive("/dashboard/profile") ? "fill-1" : "group-hover:text-primary transition-colors"
                )}
              >
                settings
              </span>
              <span className="text-[13px] font-medium">Pengaturan</span>
            </Link>
          </div>
        </nav>

      </aside>

      {/* Update Confirmation Modal */}
      <ConfirmModal
        isOpen={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        onConfirm={handleUpdate}
        title="Perbarui Multiver"
        message={`Tampilkan perintah instalasi untuk v${updateInfo?.latestVersion || ""}? Anda dapat menyalinnya dan mematikan server untuk instalasi manual.`}
        confirmText="Tampilkan Perintah"
        cancelText="Batal"
        variant="primary"
      />

      {/* Disconnected / Updating Overlay */}
      {(isDisconnected || isUpdating || autoUpdating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          {autoUpdating ? (
            <AutoUpdatePanel status={updateStatus} />
          ) : isUpdating ? (
            <ManualUpdatePanel
              latestVersion={updateInfo?.latestVersion}
              installCmd={INSTALL_CMD}
              copied={copied}
              onCopyAndShutdown={handleCopyAndShutdown}
              onCancel={handleCancelUpdate}
              countdown={shutdownCountdown}
              isDisconnected={isDisconnected}
            />
          ) : (
            <div className="text-center p-8">
              <div className="flex items-center justify-center size-16 rounded-full bg-red-500/20 text-red-500 mx-auto mb-4">
                <span className="material-symbols-outlined text-[32px]">power_off</span>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Server Terputus</h2>
              <p className="text-text-muted mb-6">Server proksi telah dihentikan.</p>
              <Button variant="secondary" onClick={() => globalThis.location.reload()}>
                Muat Ulang Halaman
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

Sidebar.propTypes = {
  onClose: PropTypes.func,
};

function ManualUpdatePanel({ latestVersion, installCmd, copied, onCopyAndShutdown, onCancel, countdown, isDisconnected }) {
  const isCountingDown = countdown > 0;
  return (
    <div className="w-full max-w-lg rounded-xl bg-neutral-900/95 border border-white/10 p-6 text-white">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center size-11 rounded-full bg-amber-500/20 text-amber-400">
          <span className="material-symbols-outlined text-[24px]">content_copy</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold">Perbarui Multiver{latestVersion ? ` ke v${latestVersion}` : ""}</h2>
          <p className="text-xs text-white/60">
            {isDisconnected
              ? "Server dihentikan. Tempelkan perintah ke terminal untuk instalasi."
              : isCountingDown
                ? `Perintah disalin. Server akan berhenti dalam ${countdown}s...`
                : "Klik tombol di bawah untuk menyalin perintah instalasi dan mematikan server."}
          </p>
        </div>
      </div>

      <p className="text-sm text-white/80 mb-2">Perintah instalasi:</p>
      <div className="w-full px-3 py-2 rounded bg-white/5 mb-4">
        <code className="text-xs font-mono text-amber-400 break-all">{installCmd}</code>
      </div>

      <ol className="text-xs text-white/70 space-y-1 list-decimal list-inside mb-4">
        <li>Klik <strong>Salin &amp; Matikan</strong> di bawah.</li>
        <li>Tempelkan perintah ke terminal Anda dan tekan Enter.</li>
        <li>Jalankan <code className="px-1 rounded bg-white/10 text-green-400">Multiver</code> lagi setelah instalasi.</li>
      </ol>

      {isDisconnected ? (
        <Button variant="secondary" fullWidth onClick={() => globalThis.location.reload()}>
          Muat Ulang Halaman
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={isCountingDown}>
            Batal
          </Button>
          <Button variant="primary" fullWidth onClick={onCopyAndShutdown} disabled={isCountingDown}>
            {copied ? "✓ Disalin — mematikan..." : isCountingDown ? `Mematikan dalam ${countdown}s` : "Salin & Matikan"}
          </Button>
        </div>
      )}
    </div>
  );
}

ManualUpdatePanel.propTypes = {
  latestVersion: PropTypes.string,
  installCmd: PropTypes.string.isRequired,
  copied: PropTypes.bool,
  onCopyAndShutdown: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  countdown: PropTypes.number,
  isDisconnected: PropTypes.bool,
};

function AutoUpdatePanel({ status }) {
  const phase = status?.phase || "starting";
  const label = {
    starting: "Memulai updater…",
    waitingForExit: "Mematikan server lama…",
    installing: "Menginstal versi baru…",
    done: "Selesai — memulai ulang…",
    error: "Gagal",
  }[phase] || phase;

  return (
    <div className="w-full max-w-lg rounded-xl bg-neutral-900/95 border border-white/10 p-6 text-white">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center size-11 rounded-full bg-green-500/20 text-green-400">
          <span className="material-symbols-outlined text-[24px]">
            {phase === "error" ? "error" : "downloading"}
          </span>
        </div>
        <div>
          <h2 className="text-lg font-semibold">Memperbarui Multiver</h2>
          <p className="text-xs text-white/60">
            Instalasi otomatis berjalan di latar belakang. Server akan hidup kembali sendiri.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-white/80 mb-3">
        {phase !== "error" && phase !== "done" && (
          <span className="material-symbols-outlined animate-spin text-[18px] text-green-400">progress_activity</span>
        )}
        <span>{label}</span>
      </div>

      {status?.logTail?.length > 0 && (
        <div className="w-full px-3 py-2 rounded bg-white/5 mb-4 max-h-40 overflow-auto">
          {status.logTail.slice(-8).map((line, i) => (
            <code key={i} className="block text-[11px] font-mono text-white/70 break-all">{line}</code>
          ))}
        </div>
      )}

      {phase === "error" ? (
        <div className="text-xs text-red-400 mb-4">
          {status?.error || "Instalasi gagal. Coba update manual via terminal."}
        </div>
      ) : null}

      {phase === "error" && (
        <Button variant="secondary" fullWidth onClick={() => globalThis.location.reload()}>
          Muat Ulang Halaman
        </Button>
      )}
    </div>
  );
}

AutoUpdatePanel.propTypes = {
  status: PropTypes.object,
};
