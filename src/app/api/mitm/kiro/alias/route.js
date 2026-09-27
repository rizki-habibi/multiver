"use server";

import { NextResponse } from "next/server";
import { getMitmAlias, setMitmAliasAll } from "@/models";
import { getMitmStatus } from "@/mitm/manager";
import { writeAliasForTool } from "@/lib/mitmAliasCache";
import { appendMitmConsoleLog } from "@/lib/mitmConsoleLog";

// GET - Get MITM aliases for a tool
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const toolName = searchParams.get("tool");
    const aliases = await getMitmAlias(toolName || undefined);
    return NextResponse.json({ aliases });
  } catch (error) {
    console.log("Error fetching MITM aliases:", error.message);
    return NextResponse.json({ error: "Failed to fetch aliases" }, { status: 500 });
  }
}

// PUT - Save MITM aliases for a specific tool
export async function PUT(request) {
  try {
    const { tool, mappings } = await request.json();

    if (!tool || !mappings || typeof mappings !== "object") {
      return NextResponse.json({ error: "tool and mappings required" }, { status: 400 });
    }

    // Check if DNS is enabled for this tool
    const status = await getMitmStatus();
    if (!status.dnsStatus || !status.dnsStatus[tool]) {
      return NextResponse.json(
        { error: `DNS must be enabled for ${tool} before editing model mappings` },
        { status: 403 }
      );
    }

    const filtered = {};
    for (const [alias, model] of Object.entries(mappings)) {
      if (model && model.trim()) {
        filtered[alias] = model.trim();
      }
    }

    await setMitmAliasAll(tool, filtered);
    const cache = writeAliasForTool(tool, filtered);
    try {
      appendMitmConsoleLog({
        level: cache?.cache ? "success" : "warning",
        source: "MITM",
        tool,
        event: cache?.cache ? "mitm.alias.saved" : "mitm.alias.cache",
        message: cache?.cache ? "Alias tersimpan ke DB + cache" : "Alias tersimpan ke DB, tapi cache gagal ditulis",
        status: cache?.cache ? "SUCCESS" : "WARNING",
        reason: cache?.cache ? null : "CACHE_WRITE_FAILED",
        error: cache?.cache ? null : cache?.error || null,
        meta: { aliasCount: Object.keys(filtered).length },
      });
    } catch { /* do not fail alias save on log write */ }
    return NextResponse.json({
      success: !!cache?.cache,
      database: true,
      cache: !!cache?.cache,
      aliases: filtered,
      ...(cache?.cache ? {} : { warning: cache?.error || "Failed to write aliases cache" }),
    });
  } catch (error) {
    console.log("Error saving MITM aliases:", error.message);
    return NextResponse.json({ error: "Failed to save aliases" }, { status: 500 });
  }
}
