import { NextResponse } from "next/server";
import { getProviderConnections, getModelAliases, getCustomModels } from "@/models";
import { getDefaultModel } from "open-sse/config/providerModels.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [connections, aliases, customModels] = await Promise.all([
      getProviderConnections({}),
      getModelAliases(),
      getCustomModels(),
    ]);

    const models = [];
    const seen = new Set();
    const add = (value) => {
      if (!value || typeof value !== "string") return;
      const id = value.trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      models.push(id);
    };

    for (const connection of connections.filter((x) => x.isActive !== false)) {
      if (connection.defaultModel) {
        add(connection.defaultModel.includes("/") ? connection.defaultModel : connection.provider + "/" + connection.defaultModel);
      }
      if (connection.provider) {
        add(connection.provider + "/" + getDefaultModel(connection.provider));
      }
    }

    for (const value of Object.values(aliases || {})) add(value);

    for (const item of customModels || []) {
      if ((item?.kind || item?.type || "llm") === "llm") add(item.id);
    }

    return NextResponse.json({ data: models.slice(0, 100) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({ data: [], error: error?.message || "Gagal memuat model." }, { status: 200 });
  }
}
