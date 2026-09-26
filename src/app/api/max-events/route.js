import { NextResponse } from "next/server";
import { getMaxEventBuffer, subscribeMaxEvents, clearMaxEventBuffer } from "@/lib/maxEvents";

export const dynamic = "force-dynamic";

// GET /api/max-events — SSE stream of MAX execution events
export async function GET(request) {
  const { searchParams } = new URL(request.url);

  // ?mode=buffer — return buffered events as JSON (for initial load)
  if (searchParams.get("mode") === "buffer") {
    const limit = Number(searchParams.get("limit")) || 100;
    return NextResponse.json({ events: getMaxEventBuffer(limit) });
  }

  // SSE stream for live updates
  const encoder = new TextEncoder();
  let unsubscribe;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat
      controller.enqueue(encoder.encode(": heartbeat\n\n"));

      unsubscribe = subscribeMaxEvents((event) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream closed
        }
      });

      // Keep-alive ping every 30s
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(keepAlive);
        }
      }, 30000);

      // Cleanup on abort
      request.signal?.addEventListener("abort", () => {
        clearInterval(keepAlive);
        if (unsubscribe) unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
    },
  });
}

// DELETE /api/max-events — clear event buffer
export async function DELETE() {
  clearMaxEventBuffer();
  return NextResponse.json({ ok: true });
}
