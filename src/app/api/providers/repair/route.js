import { NextResponse } from "next/server";
import { repairProviderData } from "@/lib/providerRepair";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const summary = await repairProviderData();
    return NextResponse.json({
      success: true,
      message: "Data layanan kompatibel sudah diperbaiki.",
      summary,
    });
  } catch (error) {
    console.error("Provider data repair failed:", error);
    return NextResponse.json(
      { success: false, error: "Perbaikan data layanan gagal" },
      { status: 500 },
    );
  }
}
