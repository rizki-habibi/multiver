// Provider & Model Registry + Compatibility Matrix.
// Semua data diambil dari sumber nyata: open-sse PROVIDERS (transport/format),
// PROVIDER_MODELS (daftar model), getCapabilitiesForModel (kapabilitas per model),
// services/usage/* (dukungan quota/usage). Tidak ada nilai yang di-hardcode.
import { PROVIDERS, PROVIDER_MODELS } from "../../../open-sse/providers/index.js";
import { getCapabilitiesForModel } from "../../../open-sse/providers/capabilities.js";
import REGISTRY from "../../../open-sse/providers/registry/index.js";

// Provider yang punya handler usage di open-sse/services/usage → quota_supported nyata.
const QUOTA_PROVIDERS = new Set([
  "antigravity", "claude", "codebuddy-cn", "codex", "commandcode", "deepseek",
  "github", "glm", "google", "grok-cli", "groq", "kimi", "kiro", "minimax",
  "opencode-go", "opencode-zen", "xiaomi-mimo", "zed",
]);

function resolveDisplay(entry) {
  return entry.display || { name: entry.id };
}

function supportsFormat(transport, format) {
  return transport?.format === format || Object.values(transport?.transports || {}).some((t) => t?.format === format);
}

function buildProviderEntry(entry) {
  const transport = PROVIDERS[entry.id];
  const display = resolveDisplay(entry);
  const fmt = transport?.format;
  return {
    id: entry.id,
    name: display.name,
    slug: entry.alias || entry.id,
    type: entry.category || "unknown",
    base_url: transport?.baseUrl || transport?.baseUrls?.[0] || null,
    protocol: fmt,
    auth_type: entry.oauth ? "oauth" : "apikey",
    models: (PROVIDER_MODELS[entry.alias || entry.id] || []).map((m) => m.id),
    status: entry.hidden ? "hidden" : (display.deprecated ? "deprecated" : "active"),
    quota_supported: QUOTA_PROVIDERS.has(entry.id),
    usage_supported: QUOTA_PROVIDERS.has(entry.id),
    streaming_supported: fmt !== undefined,
    enabled: !entry.hidden,
  };
}

export function getProviderRegistry() {
  return REGISTRY.filter((e) => PROVIDERS[e.id]).map(buildProviderEntry);
}

export function getModelRegistry() {
  const out = [];
  for (const entry of REGISTRY) {
    const key = entry.alias || entry.id;
    const models = PROVIDER_MODELS[key] || [];
    for (const m of models) {
      const caps = getCapabilitiesForModel(entry.id, m.id);
      out.push({
        provider: entry.id,
        model_id: m.id,
        display_name: m.name || m.id,
        context_window: caps.contextWindow,
        max_output: caps.maxOutput,
        vision: !!caps.vision,
        pdf: !!caps.pdf,
        audio_input: !!caps.audioInput,
        image_output: !!caps.imageOutput,
        audio_output: !!caps.audioOutput,
        tools: !!caps.tools,
        reasoning: !!caps.reasoning,
        streaming: !!PROVIDERS[entry.id]?.format,
        search: !!caps.search,
        status: "active",
      });
    }
  }
  return out;
}

const FORMAT_SUPPORT = [
  { key: "openai_chat", label: "OpenAI Chat", formats: ["openai"] },
  { key: "openai_responses", label: "OpenAI Responses", formats: ["openai-responses"] },
  { key: "anthropic_messages", label: "Anthropic Messages", formats: ["claude"] },
  { key: "gemini", label: "Gemini", formats: ["gemini"] },
];

// Status: SUPPORTED (transport format cocok), UNSUPPORTED (tidak), UNKNOWN (tidak terdaftar)
function formatStatus(transport, formats) {
  if (!transport) return "UNKNOWN";
  return formats.some((f) => supportsFormat(transport, f)) ? "SUPPORTED" : "UNSUPPORTED";
}

export function getCompatibilityMatrix() {
  const out = [];
  for (const entry of REGISTRY) {
    const transport = PROVIDERS[entry.id];
    if (!transport) continue;
    const display = resolveDisplay(entry);
    const key = entry.alias || entry.id;
    const models = PROVIDER_MODELS[key] || [];
    const caps = models.length
      ? getCapabilitiesForModel(entry.id, models[0].id)
      : getCapabilitiesForModel(entry.id, null);
    const row = {
      provider: entry.id,
      name: display.name,
      model_count: models.length,
      sample_model: models[0]?.id || null,
    };
    for (const f of FORMAT_SUPPORT) {
      row[f.key] = formatStatus(transport, f.formats);
    }
    Object.assign(row, {
      streaming: "SUPPORTED",
      vision: caps.vision ? "SUPPORTED" : "UNSUPPORTED",
      tools: caps.tools ? "SUPPORTED" : "UNSUPPORTED",
      reasoning: caps.reasoning ? "SUPPORTED" : "UNSUPPORTED",
      json_mode: caps.tools ? "SUPPORTED" : "UNKNOWN",
      embeddings: "UNKNOWN",
      quota: QUOTA_PROVIDERS.has(entry.id) ? "SUPPORTED" : "UNSUPPORTED",
      usage: QUOTA_PROVIDERS.has(entry.id) ? "SUPPORTED" : "UNSUPPORTED",
      mitm: entry.id === "kiro" ? "SUPPORTED" : "UNSUPPORTED",
      status: entry.hidden ? "HIDDEN" : (display.deprecated ? "DEPRECATED" : "ACTIVE"),
    });
    out.push(row);
  }
  return out;
}
