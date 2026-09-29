/**
 * Multiver Smart Combo planner.
 *
 * Inspired by the useful part of 9Router's tiered fallback idea:
 * subscription -> standard/API -> cheap -> free.
 *
 * Multiver deliberately adds deterministic request analysis before execution:
 * capability fit, context-window fit, tool support, task complexity and tier.
 * No extra LLM call is made just to decide the route.
 *
 * The planner NEVER removes a candidate permanently. Candidates that look
 * incompatible are pushed to the end so the existing fallback executor remains
 * the final authority on real upstream support.
 */

const HARD_CAPS = new Set(["vision", "pdf", "audioInput", "videoInput"]);

const PROVIDER_TIER_HINTS = {
  cc: "subscription",
  claude: "subscription",
  "claude-code": "subscription",
  cx: "subscription",
  codex: "subscription",
  gc: "subscription",
  "gemini-cli": "subscription",
  gh: "subscription",
  github: "subscription",
  copilot: "subscription",
  ag: "subscription",
  antigravity: "subscription",

  glm: "cheap",
  zai: "cheap",
  "z.ai": "cheap",
  minimax: "cheap",
  kimi: "cheap",
  nscale: "cheap",
  deepseek: "cheap",
  groq: "cheap",

  kiro: "free",
  kr: "free",
  xkiro: "free",
  "mimo-free": "free",
  if: "free",
  iflow: "free",
  qwen: "free",
  qw: "free",
  opencode: "free",
};

const TIER_RANK = {
  subscription: 4,
  standard: 3,
  cheap: 2,
  free: 1,
};

const TASK_KEYWORDS = {
  coding: /\b(code|coding|program|programming|debug|debugging|refactor|repository|repo|function|class|bug|error|stack trace|typescript|javascript|php|python|sql|laravel|react|next\.js)\b/i,
  analysis: /\b(analy[sz]e|analysis|compare|comparison|audit|architecture|research|reason|explain|investigate)\b/i,
  writing: /\b(write|rewrite|draft|email|essay|summary|summarize|translate|translation)\b/i,
};

function providerAndModel(modelStr) {
  const value = String(modelStr || "");
  const slash = value.indexOf("/");
  return slash > 0
    ? { provider: value.slice(0, slash).toLowerCase(), model: value.slice(slash + 1) }
    : { provider: "", model: value };
}

function countText(value) {
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) return value.reduce((n, item) => n + countText(item), 0);
  if (value && typeof value === "object") {
    return Object.entries(value).reduce((n, [key, val]) => n + key.length + countText(val), 0);
  }
  return 0;
}

function countTools(body) {
  const tools = body?.tools || body?.request?.tools;
  if (Array.isArray(tools)) return tools.length;
  if (tools && typeof tools === "object") return Object.keys(tools).length;
  return 0;
}

/**
 * Estimate complexity without a tokenizer dependency.
 * The estimate is intentionally conservative; it is a routing hint, not billing.
 */
export function analyzeComboRequest(body, requiredCapabilities = new Set()) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const input = Array.isArray(body?.input) ? body.input : [];
  const contents = Array.isArray(body?.contents)
    ? body.contents
    : (Array.isArray(body?.request?.contents) ? body.request.contents : []);

  const chars = countText(messages) + countText(input) + countText(contents);
  const estimatedInputTokens = Math.max(1, Math.ceil(chars / 4));
  const toolCount = countTools(body);
  const mediaCount = requiredCapabilities.size;

  let taskType = "general";
  const promptText = messages
    .map((m) => typeof m?.content === "string" ? m.content : JSON.stringify(m?.content || ""))
    .join("\\n");

  if (TASK_KEYWORDS.coding.test(promptText)) taskType = "coding";
  else if (TASK_KEYWORDS.analysis.test(promptText)) taskType = "analysis";
  else if (TASK_KEYWORDS.writing.test(promptText)) taskType = "writing";

  const complexityScore =
    Math.min(55, estimatedInputTokens / 1500) +
    Math.min(20, messages.length * 1.5) +
    Math.min(15, toolCount * 2) +
    Math.min(15, mediaCount * 5) +
    (taskType === "coding" || taskType === "analysis" ? 8 : 0);

  const level = complexityScore >= 55
    ? "heavy"
    : complexityScore >= 22
      ? "standard"
      : "light";

  return {
    level,
    taskType,
    estimatedInputTokens,
    toolCount,
    mediaCount,
    complexityScore: Math.round(complexityScore * 100) / 100,
  };
}

function getTier(modelStr, smartConfig = {}) {
  const { provider, model } = providerAndModel(modelStr);
  const modelTiers = smartConfig.modelTiers || {};
  const providerTiers = smartConfig.providerTiers || {};

  const explicit = modelTiers[modelStr] || modelTiers[model];
  if (explicit && TIER_RANK[explicit]) return explicit;

  const providerOverride = providerTiers[provider];
  if (providerOverride && TIER_RANK[providerOverride]) return providerOverride;

  return PROVIDER_TIER_HINTS[provider] || "standard";
}

function hasHardCapabilities(caps, required) {
  return [...required]
    .filter((cap) => HARD_CAPS.has(cap))
    .every((cap) => caps?.[cap] === true);
}

function scoreCandidate(candidate, request) {
  const { caps, index, tier, model } = candidate;
  const required = request.requiredCapabilities;

  let score = 0;
  const reasons = [];

  score += Math.max(0, 30 - index * 3);

  const hardFit = hasHardCapabilities(caps, required);
  if (hardFit) {
    score += 80;
    if (required.size) reasons.push("kapabilitas cocok");
  } else {
    score -= 1000;
    reasons.push("kapabilitas input tidak lengkap");
  }

  const requestedOutput = Number(
    request.body?.max_tokens ??
    request.body?.max_output_tokens ??
    request.body?.maxOutputTokens ??
    0,
  ) || 0;
  const neededContext = request.analysis.estimatedInputTokens + Math.max(requestedOutput, 1024);
  const contextWindow = Number(caps?.contextWindow) || 0;

  if (contextWindow > 0) {
    if (contextWindow >= neededContext * 1.15) {
      score += 45;
      reasons.push("context cukup");
    } else if (contextWindow >= neededContext) {
      score += 10;
      reasons.push("context pas");
    } else {
      score -= 700;
      reasons.push("context terlalu kecil");
    }
  }

  if (request.analysis.toolCount > 0) {
    if (caps?.tools === true) {
      score += 35;
      reasons.push("mendukung tools");
    } else {
      score -= 180;
      reasons.push("tools tidak terdeteksi didukung");
    }
  }

  if (request.analysis.level === "heavy") {
    score += tier === "subscription" ? 45 : tier === "standard" ? 25 : tier === "cheap" ? 5 : -10;
  } else if (request.analysis.level === "light") {
    score += tier === "free" ? 30 : tier === "cheap" ? 24 : tier === "standard" ? 12 : 0;
  } else {
    score += tier === "subscription" ? 24 : tier === "standard" ? 20 : tier === "cheap" ? 16 : 8;
  }

  if (request.analysis.taskType === "coding" && caps?.reasoning === true) score += 15;
  if (request.analysis.taskType === "analysis" && caps?.reasoning === true) score += 15;

  const tierRank = TIER_RANK[tier] || TIER_RANK.standard;
  score += tierRank * 4;

  return {
    ...candidate,
    score,
    reasons,
    hardFit,
    contextFit: contextWindow >= neededContext,
    neededContext,
  };
}

/**
 * Build a deterministic smart route.
 *
 * @returns {{models: string[], analysis: object, ranked: Array<object>}}
 */
export function planSmartCombo(models, body, requiredCapabilities = new Set(), smartConfig = {}) {
  const input = Array.isArray(models) ? models.filter(Boolean) : [];
  const analysis = analyzeComboRequest(body, requiredCapabilities);
  const request = { body: body || {}, requiredCapabilities, analysis };

  const ranked = input
    .map((model, index) => {
      const { provider } = providerAndModel(model);
      const parsed = providerAndModel(model);
      const caps = smartConfig.getCapabilities
        ? smartConfig.getCapabilities(provider, parsed.model)
        : null;
      return scoreCandidate({
        model,
        provider,
        index,
        caps: caps || {},
        tier: getTier(model, smartConfig),
      }, request);
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);

  return {
    models: ranked.map((item) => item.model),
    analysis,
    ranked,
  };
}

export function summarizeSmartPlan(plan) {
  if (!plan) return "smart plan unavailable";
  const top = plan.ranked?.[0];
  if (!top) return "no candidate";
  const reason = top.reasons?.slice(0, 3).join(", ") || "priority default";
  return `${plan.analysis.level}/${plan.analysis.taskType} → ${top.model} (${top.tier}; ${reason})`;
}
