"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const RISKY = /hapus|delete|remove|reset|logout|keluar|api.?key|credential|kredensial|password|token|deploy|restart|shutdown|matikan|kirim|submit|save|simpan|bayar|purchase/i;

function pageSnapshot() {
  if (typeof document === "undefined") return "";
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };
  const title = document.title || "";
  const headings = [...document.querySelectorAll("h1,h2,h3,[role=heading]")]
    .filter(visible).slice(0, 18).map((el) => el.innerText.trim()).filter(Boolean);
  const bodyText = (document.querySelector("main") || document.body).innerText
    .replace(/\n{3,}/g, "\n\n").slice(0, 5000);
  const controls = [...document.querySelectorAll("button,a,[role=button],input:not([type=password]),textarea,select")]
    .filter(visible).slice(0, 45).map((el) => {
      const tag = el.tagName.toLowerCase();
      const label = el.getAttribute("aria-label") || el.getAttribute("title") ||
        (el.labels && [...el.labels].map((x) => x.innerText.trim()).join(" ")) ||
        el.innerText || el.getAttribute("placeholder") || "";
      const href = tag === "a" ? el.getAttribute("href") : "";
      return { tag, label: String(label).trim().slice(0, 100), href: href || undefined, disabled: !!el.disabled };
    }).filter((x) => x.label);
  return JSON.stringify({ url: location.pathname, title, headings, visibleText: bodyText, controls });
}

function findControl(target, selectors) {
  const needle = String(target || "").trim().toLocaleLowerCase();
  if (!needle) return null;
  const candidates = [...document.querySelectorAll(selectors)];
  const visible = candidates.filter((el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
  });
  const score = (el) => {
    const label = [
      el.innerText, el.getAttribute("aria-label"), el.getAttribute("title"),
      el.getAttribute("placeholder"), ...(el.labels ? [...el.labels].map((x) => x.innerText) : []),
    ].filter(Boolean).join(" ").trim().toLocaleLowerCase();
    if (label === needle) return 3;
    if (label && label.includes(needle)) return 2;
    return 0;
  };
  const matches = visible.map((el) => ({ el, score: score(el) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  if (!matches.length || (matches.length > 1 && matches[0].score === matches[1].score)) return null;
  return matches[0].el;
}

export default function MaxAIWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState([]);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Halo! Saya MAX AI. Saya bisa membaca konteks halaman ini, membantu mendiagnosis router, dan mengusulkan tindakan browser yang perlu kamu konfirmasi." },
  ]);
  const [pendingAction, setPendingAction] = useState(null);
  const [notice, setNotice] = useState("");
  const abortRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/v1/models", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("Model tidak tersedia")))
      .then((data) => {
        if (!alive) return;
        const list = (data.models || []).filter((m) => m?.routedModel && (m?.caps?.chat !== false))
          .map((m) => ({ id: m.routedModel, name: m.name || m.model || m.routedModel, vision: !!m.caps?.vision }));
        setModels(list);
        setModel((current) => current || list[0]?.id || "");
      })
      .catch(() => { if (alive) setNotice("Daftar model belum dapat dimuat. Periksa konfigurasi model MAX Router."); });
    return () => { alive = false; };
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, open, busy]);

  const send = useCallback(async (override) => {
    const text = String(override ?? message).trim();
    if (!text || busy) return;
    if (!model) {
      setNotice("Belum ada model yang tersedia. Tambahkan atau aktifkan model di MAX Router.");
      return;
    }
    setNotice("");
    setPendingAction(null);
    setMessages((old) => [...old, { role: "user", text }]);
    setMessage("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/max-ai", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ message: text, model, pageContext: pageSnapshot() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Permintaan AI gagal.");
      setMessages((old) => [...old, { role: "assistant", text: data.answer || "Tidak ada jawaban dari model." }]);
      if (data.action) setPendingAction(data.action);
    } catch (error) {
      if (error.name !== "AbortError") setMessages((old) => [...old, { role: "assistant", text: "Gagal: " + (error.message || "MAX AI tidak dapat dihubungi.") }]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [message, busy, model]);

  const runAction = () => {
    const action = pendingAction;
    if (!action) return;
    setPendingAction(null);
    try {
      if (action.type === "click") {
        if (RISKY.test(action.target)) throw new Error("Tindakan ini berisiko dan harus dilakukan secara manual.");
        const el = findControl(action.target, "button,a,[role=button]");
        if (!el || el.disabled) throw new Error("Kontrol tidak ditemukan secara unik atau sedang nonaktif.");
        if (el.tagName === "A") {
          const url = new URL(el.href, location.href);
          if (url.origin !== location.origin) throw new Error("Navigasi ke domain lain tidak diizinkan oleh popup ini.");
        }
        el.click();
        setNotice("Tindakan klik dijalankan.");
      } else if (action.type === "type") {
        if (RISKY.test(action.target)) throw new Error("Pengisian kolom sensitif tidak diizinkan.");
        const el = findControl(action.target, "input:not([type=password]):not([type=hidden]),textarea");
        if (!el || el.disabled || el.readOnly) throw new Error("Kolom tidak ditemukan secara unik atau tidak dapat diedit.");
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
        if (setter) setter.call(el, action.value); else el.value = action.value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.focus();
        setNotice("Teks dimasukkan. Periksa isinya sebelum mengirim formulir.");
      } else if (action.type === "navigate") {
        const path = action.path || "";
        if (!path.startsWith("/") || path.startsWith("//") || /[\r\n]/.test(path)) throw new Error("Rute tidak valid.");
        router.push(path);
        setNotice("Membuka rute aplikasi.");
      } else if (action.type === "scroll") {
        window.scrollBy({ top: action.direction === "up" ? -Math.max(350, innerHeight * 0.7) : Math.max(350, innerHeight * 0.7), behavior: "smooth" });
        setNotice("Halaman digulirkan.");
      }
    } catch (error) {
      setNotice(error.message || "Tindakan tidak dapat dijalankan.");
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Tutup MAX AI" : "Buka MAX AI"} title="MAX AI Interaktif"
        className="fixed bottom-5 right-5 z-[120] flex h-14 items-center gap-2 rounded-full border border-blue-400/40 bg-blue-600 px-4 text-sm font-semibold text-white shadow-2xl transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400">
        <span className="material-symbols-outlined text-[22px]">{open ? "close" : "smart_toy"}</span>
        <span>{open ? "Tutup AI" : "MAX AI"}</span>
      </button>

      {open && <section aria-label="MAX AI Interaktif" className="fixed bottom-24 right-5 z-[120] flex h-[min(72vh,680px)] w-[min(94vw,420px)] flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface text-text shadow-2xl">
        <header className="flex items-center justify-between border-b border-border-subtle bg-surface-secondary px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-blue-600 text-white"><span className="material-symbols-outlined">smart_toy</span></span>
            <div><p className="text-sm font-semibold">MAX AI Interaktif</p><p className="text-xs text-text-muted">Konteks halaman · kontrol terkonfirmasi</p></div>
          </div>
          <button type="button" onClick={() => setMessages([{ role: "assistant", text: "Percakapan baru. Apa yang ingin kamu lakukan?" }])} className="rounded-lg p-2 text-text-muted hover:bg-surface" title="Percakapan baru" aria-label="Percakapan baru"><span className="material-symbols-outlined">add_comment</span></button>
        </header>

        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
          <label htmlFor="max-ai-model" className="shrink-0 text-xs text-text-muted">Model</label>
          <select id="max-ai-model" value={model} onChange={(e) => setModel(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface px-2 py-1.5 text-xs">
            {models.length === 0 && <option value="">Tidak ada model</option>}
            {models.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
          </select>
          <button type="button" onClick={() => send("Baca dan rangkum halaman ini. Tunjukkan masalah atau informasi penting yang terlihat.")} disabled={busy} className="rounded-lg border border-border-subtle px-2 py-1.5 text-xs hover:bg-surface-secondary disabled:opacity-50">Baca</button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
          {messages.map((item, index) => <div key={index} className={item.role === "user" ? "ml-8 rounded-2xl rounded-br-sm bg-blue-600 px-3 py-2 text-sm text-white" : "mr-5 rounded-2xl rounded-bl-sm border border-border-subtle bg-surface-secondary px-3 py-2 text-sm"}>
            <p className="mb-1 text-[10px] font-semibold uppercase opacity-70">{item.role === "user" ? "Kamu" : "MAX AI"}</p>
            <p className="whitespace-pre-wrap break-words">{item.text}</p>
          </div>)}
          {busy && <div className="mr-12 rounded-xl bg-surface-secondary px-3 py-2 text-sm text-text-muted"><span className="material-symbols-outlined mr-1 inline animate-pulse text-base">progress_activity</span> Menganalisis halaman…</div>}
          <div ref={endRef} />
        </div>

        {pendingAction && <div className="mx-3 mb-2 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Konfirmasi tindakan</p>
          <p className="mt-1 text-sm">{pendingAction.type === "click" ? "Klik: " + pendingAction.target : pendingAction.type === "type" ? "Isi kolom " + pendingAction.target + " dengan: " + pendingAction.value : pendingAction.type === "navigate" ? "Buka rute: " + pendingAction.path : "Gulir halaman: " + pendingAction.direction}</p>
          <div className="mt-2 flex gap-2"><button type="button" onClick={runAction} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500">Jalankan</button><button type="button" onClick={() => setPendingAction(null)} className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs">Batal</button></div>
        </div>}

        {notice && <p className="px-3 pb-1 text-xs text-text-muted" role="status">{notice}</p>}

        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t border-border-subtle p-3">
          <div className="flex items-end gap-2">
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={6000} placeholder="Tanya atau beri instruksi…" className="min-h-[44px] max-h-32 flex-1 resize-y rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm outline-none focus:border-blue-500" />
            {busy
              ? <button type="button" onClick={() => abortRef.current?.abort()} className="flex size-10 items-center justify-center rounded-xl border border-border-subtle hover:bg-surface-secondary" title="Hentikan" aria-label="Hentikan permintaan"><span className="material-symbols-outlined">stop</span></button>
              : <button type="submit" disabled={!message.trim() || !model} className="flex size-10 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40" title="Kirim" aria-label="Kirim pesan"><span className="material-symbols-outlined">send</span></button>}
          </div>
          <p className="mt-1 text-[10px] text-text-muted">AI hanya menerima ringkasan halaman yang terlihat. Aksi harus dikonfirmasi; tab lain dan domain lain tidak dikendalikan.</p>
        </form>
      </section>}
    </>
  );
}
