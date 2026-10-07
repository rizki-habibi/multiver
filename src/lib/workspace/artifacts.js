import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "@/lib/dataDir.js";

export const ARTIFACT_DIR = path.join(DATA_DIR, "workspace-artifacts");

export const FORMAT_META = {
  doc: { ext: "doc", mime: "application/msword", label: "Word" },
  xls: { ext: "xls", mime: "application/vnd.ms-excel", label: "Excel" },
  csv: { ext: "csv", mime: "text/csv; charset=utf-8", label: "CSV" },
  md: { ext: "md", mime: "text/markdown; charset=utf-8", label: "Markdown" },
  txt: { ext: "txt", mime: "text/plain; charset=utf-8", label: "Teks" },
  json: { ext: "json", mime: "application/json; charset=utf-8", label: "JSON" },
  html: { ext: "html", mime: "text/html; charset=utf-8", label: "HTML" },
};

function escapeHtml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cleanFilename(value = "hasil-ai") {
  return String(value).normalize("NFKD").replace(/[^a-zA-Z0-9\s_-]/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "hasil-ai";
}

function titleFromText(text) {
  const first = String(text || "").split(/\r?\n/).map((x) => x.trim()).find(Boolean);
  return (first || "Hasil AI").replace(/^#+\s*/, "").slice(0, 100);
}

function tableRows(text) {
  const lines = String(text || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const md = lines.filter((line) => line.includes("|"));
  if (md.length >= 2) {
    return md
      .filter((line) => !/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(line))
      .map((line) => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((x) => x.trim()));
  }
  return lines.map((line) => line.split(/\t|,/).map((x) => x.trim()));
}

function toWordHtml(text, title) {
  const body = String(text || "").split(/\r?\n/).map((line) => {
    const t = line.trim();
    if (!t) return "<p>&nbsp;</p>";
    if (t.startsWith("### ")) return `<h3>${escapeHtml(t.slice(4))}</h3>`;
    if (t.startsWith("## ")) return `<h2>${escapeHtml(t.slice(3))}</h2>`;
    if (t.startsWith("# ")) return `<h1>${escapeHtml(t.slice(2))}</h1>`;
    return `<p>${escapeHtml(t)}</p>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.55;margin:2.2cm;color:#202124}h1{font-size:20pt;margin:0 0 16pt}h2{font-size:15pt;margin-top:18pt}h3{font-size:12pt;margin-top:14pt}p{margin:0 0 8pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px}</style></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
}

function toExcelHtml(text, title) {
  const rows = tableRows(text);
  const table = rows.map((row) => `<tr>${row.map((cell) => `<td style="border:1px solid #999;padding:6px">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  return `<html><head><meta charset="utf-8"><style>body{font-family:Calibri,Arial;font-size:11pt}table{border-collapse:collapse}td{border:1px solid #999;padding:6px}h1{font-size:16pt}</style></head><body><h1>${escapeHtml(title)}</h1><table>${table}</table></body></html>`;
}

function toCsv(text) {
  return tableRows(text).map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

function detectFormat(prompt, requested) {
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

export async function saveArtifact({ text, prompt, requestedFormat }) {
  const format = detectFormat(prompt, requestedFormat);
  if (!format || !FORMAT_META[format]) return null;

  const meta = FORMAT_META[format];
  const title = titleFromText(text);
  let content = String(text || "");
  if (format === "doc") content = toWordHtml(text, title);
  else if (format === "xls") content = toExcelHtml(text, title);
  else if (format === "csv") content = toCsv(text);
  else if (format === "json") content = JSON.stringify({ judul: title, isi: text }, null, 2);
  else if (format === "html") content = toWordHtml(text, title);

  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const id = crypto.randomUUID();
  const filename = cleanFilename(title) + "." + meta.ext;
  const filePath = path.join(ARTIFACT_DIR, id + "." + meta.ext);
  const metaPath = path.join(ARTIFACT_DIR, id + ".json");
  const bytes = Buffer.from(content, "utf8");

  await fs.writeFile(filePath, bytes);
  await fs.writeFile(metaPath, JSON.stringify({ id, filename, format, mime: meta.mime, filePath, createdAt: new Date().toISOString() }));

  return {
    id, format, filename, title, mime: meta.mime, size: bytes.length,
    sizeLabel: bytes.length < 1024 ? bytes.length + " B" : (bytes.length / 1024).toFixed(1) + " KB",
    preview: String(text || "").slice(0, 9000),
    url: "/api/workspace/files/" + id,
  };
}
