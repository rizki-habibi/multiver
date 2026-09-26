import { NextResponse } from "next/server";
import { getMitmConsoleLogs, clearMitmConsoleLogs } from "@/lib/mitmConsoleLog";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const level = searchParams.get("level") || "all";
    const source = searchParams.get("source") || "all";
    const tool = searchParams.get("tool") || "all";
    const search = searchParams.get("search") || "";
    const limit = searchParams.get("limit") || "100";
    const logs = getMitmConsoleLogs({ level, source, tool, search, limit: Number(limit) });
    return NextResponse.json({ logs });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to read console logs" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    clearMitmConsoleLogs();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to clear logs" }, { status: 500 });
  }
}
