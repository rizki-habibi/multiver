import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ error: "Legacy authentication disabled; use GitHub owner login only." }, { status: 410, headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  return NextResponse.json({ error: "Legacy authentication disabled; use GitHub owner login only." }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
