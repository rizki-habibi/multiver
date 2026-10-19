// Resolusi ikon provider: Base URL terlebih dahulu, lalu domain resmi dan cadangan favicon.
// Hanya URL HTTP(S) yang diterima; nilai ini khusus untuk gambar, bukan endpoint API.
const OFFICIAL_PROVIDER_ORIGINS = {
  openai: "https://openai.com", chatgpt: "https://chatgpt.com",
  anthropic: "https://anthropic.com", claude: "https://claude.ai",
  google: "https://google.com", gemini: "https://gemini.google.com",
  googleai: "https://ai.google.dev", "gemini-cli": "https://ai.google.dev",
  xai: "https://x.ai", grok: "https://grok.com", deepseek: "https://deepseek.com",
  qwen: "https://qwen.ai", alibaba: "https://alibabacloud.com", kimi: "https://kimi.com",
  moonshot: "https://moonshot.ai", mistral: "https://mistral.ai", cohere: "https://cohere.com",
  perplexity: "https://perplexity.ai", together: "https://together.ai",
  fireworks: "https://fireworks.ai", groq: "https://groq.com", cerebras: "https://cerebras.ai",
  huggingface: "https://huggingface.co", hugging_face: "https://huggingface.co",
  replicate: "https://replicate.com", openrouter: "https://openrouter.ai",
  azure: "https://azure.microsoft.com", microsoft: "https://microsoft.com",
  github: "https://github.com", gitlab: "https://gitlab.com", cursor: "https://cursor.com",
  windsurf: "https://windsurf.com", kiro: "https://kiro.dev", ollama: "https://ollama.com",
  cloudflare: "https://cloudflare.com", "cloudflare-ai": "https://developers.cloudflare.com",
  vercel: "https://vercel.com", railway: "https://railway.app", supabase: "https://supabase.com",
  nebius: "https://nebius.com", novita: "https://novita.ai", sambanova: "https://sambanova.ai",
  hyperbolic: "https://hyperbolic.xyz", ai21: "https://ai21.com", writer: "https://writer.com",
  amazon: "https://aws.amazon.com", bedrock: "https://aws.amazon.com", nvidia: "https://nvidia.com",
  xiaomi: "https://mi.com", iflow: "https://iflow.cn", qoder: "https://qoder.com",
  zed: "https://zed.dev", trae: "https://trae.ai",
};

export function resolveProviderIconId(providerId) {
  return String(providerId || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function safeUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export function isValidProviderIconUrl(value) {
  return typeof value === "string" && (!value.trim() || !!safeUrl(value));
}

/** Kandidat favicon berurutan. Komponen mencoba kandidat berikutnya jika gambar gagal. */
export function getProviderIconCandidates(providerId, baseUrl, customIconUrl) {
  const candidates = [];
  const add = (value) => {
    const url = safeUrl(value);
    if (url && !candidates.includes(url.href)) candidates.push(url.href);
  };

  // Override manual adalah prioritas tertinggi.
  add(customIconUrl);
  // Gunakan origin Base URL yang diisi pengguna; path API seperti /v1 tidak ikut.
  const configured = safeUrl(baseUrl);
  const id = resolveProviderIconId(providerId);
  const origin = OFFICIAL_PROVIDER_ORIGINS[id] || configured?.origin;
  if (origin) {
    add(`${origin}/favicon.ico`);
    add(`${origin}/favicon.svg`);
    add(`${origin}/favicon.png`);
    add(`${origin}/apple-touch-icon.png`);
    // Cadangan untuk domain yang tidak menyediakan /favicon.ico.
    try {
      const hostname = new URL(origin).hostname;
      add(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`);
    } catch { /* Origin sudah tervalidasi; abaikan jika browser menolak URL. */ }
  }
  return candidates;
}

/** Dipertahankan untuk kompatibilitas pemanggil lama. */
export function getProviderIconSrc(providerId, baseUrl, customIconUrl) {
  return getProviderIconCandidates(providerId, baseUrl, customIconUrl)[0] || null;
}

/** Dipertahankan agar pemanggil lama tetap kompatibel. */
export function markProviderIconMissing() {}
