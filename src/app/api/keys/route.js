import { NextResponse } from "next/server";
import { getApiKeys, createApiKey } from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";

export const dynamic = "force-dynamic";

// GET /api/keys - List API keys
export async function GET() {
  try {
    const keys = await getApiKeys();
    return NextResponse.json({ keys });
  } catch (error) {
    console.log("Error fetching keys:", error);
    return NextResponse.json({ error: "Failed to fetch keys" }, { status: 500 });
  }
}

// POST /api/keys - Create new API key
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, scopeType, scopeProvider } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const existingKeys = await getApiKeys();
    // The first router key is the master/global key. Subsequent keys default to private.
    const normalizedScopeType = existingKeys.length === 0
      ? "global"
      : (scopeType === "global" ? "global" : "private");

    if (normalizedScopeType === "private" && !String(scopeProvider || "").trim()) {
      return NextResponse.json({ error: "Provider wajib dipilih untuk key pribadi" }, { status: 400 });
    }

    // Always get machineId from server
    const machineId = await getConsistentMachineId();
    const apiKey = await createApiKey(
      name,
      machineId,
      normalizedScopeType,
      normalizedScopeType === "private" ? String(scopeProvider).trim() : null
    );

    return NextResponse.json({
      key: apiKey.key,
      name: apiKey.name,
      id: apiKey.id,
      machineId: apiKey.machineId,
      scopeType: apiKey.scopeType,
      scopeProvider: apiKey.scopeProvider,
    }, { status: 201 });
  } catch (error) {
    console.log("Error creating key:", error);
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }
}
