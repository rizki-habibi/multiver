import { NextResponse } from "next/server";
import { handleChat } from "@/sse/handlers/chat.js";
import { initTranslators } from "open-sse/translator/index.js";
import { saveArtifact } from "@/lib/workspace/artifacts.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

let initialized = false;

async function ensureReady() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
  }
}

function extractAssistantText(raw, contentType = "") {
  const source = String(raw || "");
  if (!source) return "";
  if (contentType.includes("application/json") || source.trim().startsWith("{")) {
    try {
      const data = JSON.parse(source);
      const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.delta?.content;
      if (typeof content === "string") return content.trim();
      if (Array.isArray(content)) return content.map((part) => part?.text || "").join("").trim();
    } catch {}
  }
  const parts = [];
  for (const line of source.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const data = JSON.parse(payload);
      const content = data?.choices?.[0]?.delta?.content ?? data?.choices?.[0]?.message?.content;
      if (typeof content === "string") parts.push(content);
      else if (Array.isArray(content)) parts.push(content.map((part) => part?.text || "").join(""));
    } catch {}
  }
  return parts.join("").trim();
}

function formatInstruction(format) {
  const instructions = {
    doc: "Hasil harus siap menjadi dokumen Word. Gunakan judul, subjudul, paragraf, dan tabel Markdown jika diperlukan.",
    xls: "Hasil harus berupa data tabular yang jelas. Jika ada data, utamakan tabel Markdown dengan header dan baris data.",
    csv: "Hasil harus berupa tabel sederhana dengan header dan baris data yang mudah dikonversi menjadi CSV.",
    md: "Hasil harus berupa Markdown yang terstruktur.",
    txt: "Hasil harus berupa teks terstruktur tanpa format rumit.",
    json: "Hasil harus berupa JSON valid tanpa markdown fence.",
    html: "Hasil harus berupa konten HTML yang terstruktur.",
  };
  return instructions[format] || "Jawab secara normal. Jika pengguna meminta berkas, susun isi yang siap dijadikan berkas.";
}

function detectRequestedFormat(prompt, requested) {
  if (requested && requested !== "auto") return requested;
  const s = String(prompt || "").toLowerCase();
  if (s.includes("word") || s.includes("docx") || s.includes("dokumen")) return "doc";
  if (s.includes("excel") || s.includes("xlsx") || s.includes("spreadsheet") || s.includes("lembar kerja")) return "xls";
  if (s.includes("csv")) return "csv";
  if (s.includes("markdown") || s.includes(".md")) return "md";
  if (s.includes("json")) return "json";
  if (s.includes("html") || s.includes("halaman web")) return "html";
  if (s.includes("txt") || s.includes("teks")) return "txt";
  return null;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 30000) : "";
    const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : "gemini-2.5-flash";
    const requestedFormat = typeof body.format === "string" ? body.format : "auto";
    if (!prompt) return NextResponse.json({ error: "Permintaan kosong." }, { status: 400 });

    await ensureReady();

    const detected = detectRequestedFormat(prompt, requestedFormat);
    const internalRequest = new Request("http://multiver.local/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "Multiver-RuangKerja/1.0" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "Kamu adalah asisten Ruang Kerja AI di Multiver. Fokus pada hasil yang langsung dapat dipakai pengguna. Jangan mengaku telah membuat file sebelum gateway selesai. " + formatInstruction(detected),
          },
          { role: "user", content: prompt },
        ],
        stream: false,
      }),
    });

    const response = await handleChat(internalRequest, null, { internal: true });
    const raw = await response.text();
    const answer = extractAssistantText(raw, response.headers.get("content-type") || "");

    if (!response.ok) {
      return NextResponse.json({ error: answer || raw || ("Gateway HTTP " + response.status) }, { status: response.status || 502 });
    }
    if (!answer) return NextResponse.json({ error: "AI tidak mengembalikan teks yang bisa diproses." }, { status: 502 });

    const artifact = await saveArtifact({ text: answer, prompt, requestedFormat });
    return NextResponse.json({ answer, model, artifact, format: artifact?.format || null }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Gagal membuat hasil Ruang Kerja AI." }, { status: 500 });
  }
}
