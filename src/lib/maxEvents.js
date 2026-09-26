// Shared in-memory event bus + buffer for Multiver MAX execution events
// Retains the last 200 events for Console Log viewer and SSE streaming.

const MAX_EVENT_BUFFER_SIZE = 500;
const eventBuffer = [];
const subscribers = new Set();

// Sensitive keys to redact
const SENSITIVE_KEY_REGEX = /(?:api[_-]?key|authorization|bearer|secret|password|token)/i;

export function redactSensitive(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitive);
  const copy = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_REGEX.test(k) && typeof v === "string") {
      copy[k] = v.length > 8 ? `${v.slice(0, 4)}...${v.slice(-4)}` : "********";
    } else if (typeof v === "object" && v !== null) {
      copy[k] = redactSensitive(v);
    } else {
      copy[k] = v;
    }
  }
  return copy;
}

export function emitMaxEvent(event) {
  const safeEvent = {
    ...redactSensitive(event),
    id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  };

  eventBuffer.push(safeEvent);
  if (eventBuffer.length > MAX_EVENT_BUFFER_SIZE) {
    eventBuffer.shift();
  }

  // Notify active SSE subscribers
  for (const sub of subscribers) {
    try {
      sub(safeEvent);
    } catch {
      // Ignore dead subscriber
    }
  }

  return safeEvent;
}

export function subscribeMaxEvents(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

export function getMaxEventBuffer(limit = 100) {
  return eventBuffer.slice(-Math.max(1, Math.min(limit, MAX_EVENT_BUFFER_SIZE)));
}

export function clearMaxEventBuffer() {
  eventBuffer.length = 0;
}
