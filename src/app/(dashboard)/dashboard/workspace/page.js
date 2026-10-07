"use client";

import { useEffect, useState } from "react";

const FORMATS = [
  ["auto", "Otomatis", "auto_awesome"],
  ["doc", "Word", "description"],
  ["xls", "Excel", "table_chart"],
  ["csv", "CSV", "table_rows"],
  ["md", "Markdown", "markdown"],
  ["txt", "Teks", "notes"],
  ["json", "JSON", "data_object"],
  ["html", "HTML", "language"],
];

const iconFor = (format) => FORMATS.find((x) => x[0] === format)?.[2] || "draft";

export default function WorkspacePage() {
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [format, setFormat] = useState("auto");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [artifact, setArtifact] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/v1/models", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!alive) return;
        const ids = (Array.isArray(data?.data) ? data.data : [])
          .map((x) => x?.id)
          .filter(Boolean);
        setModels(ids.slice(0, 100));
        if (!model && ids[0]) setModel(ids[0]);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [model]);

  async function send() {
    const text = prompt.trim();
    if (!text || busy) return;

    setBusy(true);
    setStatus("AI sedang menyusun hasil…");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setPrompt("");
    setArtifact(null);

    try {
      const res = await fetch("/api/workspace/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          model: model || models[0] || "gemini-2.5-flash",
          format,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gateway gagal memproses permintaan.");

      setMessages((prev) => [...prev, {
        role: "assistant",
        content: data.answer || "Tidak ada jawaban.",
        model: data.model,
      }]);
      if (data.artifact) {
        setArtifact(data.artifact);
        setStatus("Berkas berhasil dibuat.");
      } else {
        setStatus("Selesai.");
      }
    } catch (error) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        error: true,
        content: "Terjadi kesalahan: " + (error?.message || "permintaan gagal"),
      }]);
      setStatus("Gagal.");
    } finally {
      setBusy(false);
    }
  }

  function chooseFormat(id) {
    setFormat(id);
    if (!prompt.trim()) {
      const examples = {
        doc: "Buat dokumen Word yang rapi dan formal dari permintaan saya.",
        xls: "Buat spreadsheet Excel yang rapi dari data/permintaan saya.",
        csv: "Susun hasil menjadi tabel data yang siap diimpor ke Excel.",
      };
      if (examples[id]) setPrompt(examples[id]);
    }
  }

  return (
    <main className="h-full min-h-[calc(100vh-24px)] flex flex-col bg-[var(--color-bg)]">
      <header className="h-14 shrink-0 border-b border-border-subtle bg-vibrancy px-4 md:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-[19px]">auto_awesome</span>
          </div>
          <div className="min-w-0">
            <h1 className="font-semibold text-sm truncate">Ruang Kerja AI</h1>
            <p className="text-[11px] text-text-muted truncate">Chat, Word, Excel, dan berkas lain dalam satu ruang</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-[11px] text-text-muted">Model</span>
          <select value={model} onChange={(e) => setModel(e.target.value)}
            className="max-w-[260px] rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-xs outline-none">
            <option value="">Otomatis / model pertama</option>
            {models.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
      </header>

      <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,42%)]">
        <section className="min-h-0 flex flex-col border-r border-border-subtle">
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 py-8">
            {messages.length === 0 ? (
              <div className="max-w-3xl mx-auto min-h-full flex flex-col items-center justify-center text-center">
                <div className="size-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-5">
                  <span className="material-symbols-outlined text-[34px]">edit_document</span>
                </div>
                <h2 className="text-2xl font-semibold tracking-tight mb-2">Apa yang ingin kamu buat?</h2>
                <p className="text-sm text-text-muted max-w-xl">
                  Semua model yang melewati Max Router dapat digunakan untuk menyusun dokumen.
                  Pilih format tertentu atau gunakan Otomatis agar format terdeteksi dari permintaan.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-7 w-full max-w-2xl">
                  {[
                    ["doc", "Dokumen Word", "description"],
                    ["xls", "Spreadsheet Excel", "table_chart"],
                    ["csv", "Data CSV", "table_rows"],
                  ].map(([id, label, icon]) => (
                    <button key={id} onClick={() => chooseFormat(id)}
                      className="rounded-xl border border-border-subtle bg-surface p-4 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors">
                      <span className="material-symbols-outlined text-primary text-[22px]">{icon}</span>
                      <div className="text-sm font-medium mt-2">{label}</div>
                      <div className="text-[11px] text-text-muted mt-1">Siapkan dari percakapan</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-7">
                {messages.map((item, index) => (
                  <div key={index} className={item.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div className={item.role === "user"
                      ? "max-w-[88%] rounded-2xl rounded-br-md bg-primary text-white px-4 py-3 text-sm whitespace-pre-wrap"
                      : "max-w-[92%] text-sm leading-7 whitespace-pre-wrap"}>
                      {item.role === "assistant" && (
                        <div className="flex items-center gap-2 mb-2 text-[11px] text-text-muted">
                          <span className="material-symbols-outlined text-[15px] text-primary">auto_awesome</span>
                          {item.model || "Max Router"}
                        </div>
                      )}
                      {item.content}
                    </div>
                  </div>
                ))}
                {busy && (
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                    {status}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 p-4 md:p-6 border-t border-border-subtle bg-vibrancy">
            <div className="max-w-3xl mx-auto rounded-2xl border border-border bg-surface shadow-sm focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
              <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder="Tulis permintaan… contoh: buatkan proposal tugas akhir dalam Word"
                className="w-full resize-none bg-transparent outline-none px-4 pt-4 pb-2 text-sm" />
              <div className="px-3 pb-3 flex flex-wrap items-center gap-2">
                <select value={format} onChange={(e) => setFormat(e.target.value)}
                  className="rounded-lg border border-border-subtle bg-surface-2 px-2.5 py-1.5 text-xs outline-none">
                  {FORMATS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
                {format !== "auto" && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 text-primary px-2.5 py-1.5 text-xs">
                    <span className="material-symbols-outlined text-[14px]">{iconFor(format)}</span>
                    Akan dibuat
                  </span>
                )}
                <div className="flex-1" />
                <button onClick={send} disabled={busy || !prompt.trim()}
                  className="size-9 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-40"
                  title="Kirim">
                  <span className="material-symbols-outlined text-[19px]">arrow_upward</span>
                </button>
              </div>
            </div>
            <div className="max-w-3xl mx-auto mt-2 flex justify-between text-[10px] text-text-muted">
              <span>{status || "Enter untuk mengirim • Shift+Enter untuk baris baru"}</span>
              <span>{model || "Model otomatis"}</span>
            </div>
          </div>
        </section>

        <aside className="min-h-0 bg-surface-2 flex flex-col">
          <div className="h-12 shrink-0 border-b border-border-subtle px-4 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-[18px] text-primary">
                {artifact ? iconFor(artifact.format) : "preview"}
              </span>
              <span className="text-sm font-medium truncate">{artifact ? artifact.filename : "Pratinjau berkas"}</span>
            </div>
            {artifact?.url && (
              <a href={artifact.url} download
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-white px-3 py-1.5 text-xs font-medium shrink-0">
                <span className="material-symbols-outlined text-[15px]">download</span>
                Unduh
              </a>
            )}
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
            {artifact ? (
              <div className="mx-auto max-w-2xl rounded-xl bg-white text-gray-900 shadow-lg min-h-[70%] p-6 md:p-8">
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-4 flex items-center justify-between">
                  <span>{artifact.mime || "Berkas"}</span>
                  <span>{artifact.sizeLabel}</span>
                </div>
                <h2 className="text-xl font-bold mb-4">{artifact.title || artifact.filename}</h2>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-gray-700">{artifact.preview}</pre>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center text-text-muted">
                <div>
                  <span className="material-symbols-outlined text-[44px] opacity-30">description</span>
                  <p className="text-sm mt-3">Hasil Word, Excel, dan berkas lain akan muncul di sini.</p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
