import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { ARTIFACT_DIR } from "@/lib/workspace/artifacts.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const { id: rawId } = await params;
  const id = String(rawId || "").replace(/[^a-zA-Z0-9-]/g, "");
  if (!id) return NextResponse.json({ error: "ID berkas tidak valid." }, { status: 400 });

  try {
    const meta = JSON.parse(await fs.readFile(ARTIFACT_DIR + "/" + id + ".json", "utf8"));
    const bytes = await fs.readFile(meta.filePath);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": meta.mime || "application/octet-stream",
        "Content-Length": String(bytes.length),
        "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(meta.filename),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Berkas tidak ditemukan atau sudah kedaluwarsa." }, { status: 404 });
  }
}
