import { NextResponse } from "next/server";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: "Password login is disabled. Multiver hanya menerima login melalui GitHub administrator yang diizinkan.",
    },
    { status: 403, headers: NO_STORE_HEADERS }
  );
}
