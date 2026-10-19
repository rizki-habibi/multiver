// Resolusi ikon penyedia dari favicon pada domain resmi atau base URL kustom.
const OFFICIAL_PROVIDER_ORIGINS = {
  openai: "https://openai.com",
  chatgpt: "https://chatgpt.com",
  anthropic: "https://anthropic.com",
  claude: "https://claude.ai",
  google: "https://google.com",
  gemini: "https://gemini.google.com",
  googleai: "https://ai.google.dev",
  "gemini-cli": "https://ai.google.dev",
  xai: "https://x.ai",
  grok: "https://grok.com",
  deepseek: "https://deepseek.com",
  qwen: "https://qwen.ai",
  alibaba: "https://alibabacloud.com",
  kimi: "https://kimi.com",
  moonshot: "https://moonshot.ai",
  mistral: "https://mistral.ai",
  cohere: "https://cohere.com",
  perplexity: "https://perplexity.ai",
  together: "https://together.ai",
  fireworks: "https://fireworks.ai",
  groq: "https://groq.com",
  cerebras: "https://cerebras.ai",
  huggingface: "https://huggingface.co",
  hugging_face: "https://huggingface.co",
  replicate: "https://replicate.com",
  openrouter: "https://openrouter.ai",
  azure: "https://azure.microsoft.com",
  microsoft: "https://microsoft.com",
  github: "https://github.com",
  gitlab: "https://gitlab.com",
  cursor: "https://cursor.com",
  windsurf: "https://windsurf.com",
  kiro: "https://kiro.dev",
  ollama: "https://ollama.com",
  cloudflare: "https://cloudflare.com",
  "cloudflare-ai": "https://developers.cloudflare.com",
  vercel: "https://vercel.com",
  railway: "https://railway.app",
  supabase: "https://supabase.com",
  nebius: "https://nebius.com",
  novita: "https://novita.ai",
  sambanova: "https://sambanova.ai",
  hyperbolic: "https://hyperbolic.xyz",
  ai21: "https://ai21.com",
  writer: "https://writer.com",
  amazon: "https://aws.amazon.com",
  bedrock: "https://aws.amazon.com",
  nvidia: "https://nvidia.com",
  xiaomi: "https://mi.com",
  iflow: "https://iflow.cn",
  qoder: "https://qoder.com",
  zed: "https://zed.dev",
  trae: "https://trae.ai",
};

export function resolveProviderIconId(providerId) {
  return String(providerId || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
}

function safeOrigin(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** Mengutamakan base URL penyedia yang dikonfigurasi; jika tidak ada, pakai domain resmi. */
export function getProviderIconSrc(providerId, baseUrl) {
  const id = resolveProviderIconId(providerId);
  const origin = safeOrigin(baseUrl) || OFFICIAL_PROVIDER_ORIGINS[id];
  return origin ? `${origin}/favicon.ico` : null;
}

/** Dipertahankan agar pemanggil lama tetap kompatibel. */
export function markProviderIconMissing() {}
