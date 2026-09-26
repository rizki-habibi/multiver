import { NextResponse } from "next/server";
import { getCompatibilityMatrix, getProviderRegistry, getModelRegistry } from "@/lib/compatibility/registry.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "matrix";
  try {
    if (view === "providers") return NextResponse.json({ providers: getProviderRegistry() });
    if (view === "models") return NextResponse.json({ models: getModelRegistry() });
    return NextResponse.json({ matrix: getCompatibilityMatrix() });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
