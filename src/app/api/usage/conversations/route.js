import { NextResponse } from "next/server";
import { getRequestDetails } from "@/lib/usageDb";

/**
 * GET /api/usage/conversations
 * Riwayat percakapan: prompt user + respons AI + parameter yang dipakai.
 * Query: page, pageSize (1-100), provider, model, status, startDate, endDate
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const pageRaw = parseInt(searchParams.get("page"));
    const page = Number.isNaN(pageRaw) ? 1 : pageRaw;
    const pageSizeRaw = parseInt(searchParams.get("pageSize"));
    const pageSize = Number.isNaN(pageSizeRaw) ? 20 : pageSizeRaw;

    if (page < 1) return NextResponse.json({ error: "Halaman harus >= 1" }, { status: 400 });
    if (pageSize < 1 || pageSize > 100) return NextResponse.json({ error: "PageSize 1-100" }, { status: 400 });

    const filter = { page, pageSize };
    const provider = searchParams.get("provider");
    const model = searchParams.get("model");
    const status = searchParams.get("status");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    if (provider) filter.provider = provider;
    if (model) filter.model = model;
    if (status) filter.status = status;
    if (startDate) filter.startDate = startDate;
    if (endDate) filter.endDate = endDate;

    const result = await getRequestDetails(filter);

    // Ringkas setiap record jadi baris tabel: pesan user, respons AI, param.
    const rows = (result.details || []).map((d) => {
      const req = d.request || {};
      const messages = Array.isArray(req.messages) ? req.messages : [];
      const input = Array.isArray(req.input) ? req.input : [];

      // Pesan user terakhir (prompt yang dipakai).
      const userMsgs = [...messages, ...input].filter((m) => m && m.role === "user");
      const lastUser = userMsgs[userMsgs.length - 1];
      const userText = typeof lastUser?.content === "string"
        ? lastUser.content
        : Array.isArray(lastUser?.content)
          ? lastUser.content.map((b) => (typeof b === "string" ? b : b?.text || "")).join("")
          : "";

      const res = d.response || {};
      const aiText = typeof res.content === "string"
        ? res.content
        : Array.isArray(res.content)
          ? res.content.map((b) => b?.text || "").join("")
          : "";

      return {
        id: d.id,
        timestamp: d.timestamp,
        provider: d.provider,
        model: d.model,
        connectionId: d.connectionId,
        status: d.status,
        prompt: String(userText || "").slice(0, 500),
        response: String(aiText || "").slice(0, 1000),
        tokens: d.tokens || {},
        latency: d.latency || {},
        params: {
          temperature: req.temperature,
          max_tokens: req.max_tokens,
          top_p: req.top_p,
          stream: req.stream,
        },
      };
    });

    return NextResponse.json({ rows, pagination: result.pagination });
  } catch (error) {
    console.error("[API] conversations error:", error);
    return NextResponse.json({ error: "Gagal memuat riwayat percakapan" }, { status: 500 });
  }
}
