import {
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
  extractApiKey,
  isValidApiKey,
} from "../services/auth.js";
import { getSettings } from "@/lib/localDb";
import { getModelInfo } from "../services/model.js";
import { handleSystemoneCore } from "open-sse/handlers/systemoneCore.js";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import * as log from "../utils/logger.js";
import { checkAndRefreshToken } from "../services/tokenRefresh.js";
import { saveRequestUsage } from "@/lib/usageDb.js";

/**
 * Handle System One (Jev) decision requests for the Next.js server.
 * Follows the same auth + account-fallback pattern as handleEmbeddings.
 *
 * @param {Request} request
 */
export async function handleSystemone(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    log.warn("SYSTEMONE", "Isi JSON tidak valid");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Isi JSON tidak valid");
  }

  const url = new URL(request.url);
  const modelStr = body.model;

  log.request("POST", `${url.pathname} | ${modelStr}`);

  // Log API key (masked)
  const apiKey = extractApiKey(request);
  if (apiKey) {
    log.debug("AUTH", `API Key: ${log.maskKey(apiKey)}`);
  } else {
    log.debug("AUTH", "No API key provided (local mode)");
  }

  // Enforce API key if enabled in settings
  const settings = await getSettings();
  if (settings.requireApiKey) {
    if (!apiKey) {
      log.warn("AUTH", "Missing API key (requireApiKey=true)");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Kunci API hilang");
    }
    const valid = await isValidApiKey(apiKey);
    if (!valid) {
      log.warn("AUTH", "Invalid API key (requireApiKey=true)");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Kunci API tidak valid");
    }
  }

  if (!modelStr) {
    log.warn("SYSTEMONE", "Model hilang");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Model hilang");
  }
  if (body.state === undefined || body.state === null) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Isi wajib hilang: state");
  }
  if (!body.questions || typeof body.questions !== "object" || Array.isArray(body.questions)) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Isi wajib hilang: questions");
  }

  const modelInfo = await getModelInfo(modelStr);
  if (!modelInfo.provider) {
    log.warn("SYSTEMONE", "Format model tidak valid", { model: modelStr });
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Format model tidak valid");
  }

  const { provider, model } = modelInfo;

  if (modelStr !== `${provider}/${model}`) {
    log.info("ROUTING", `${modelStr} → ${provider}/${model}`);
  } else {
    log.info("ROUTING", `Provider: ${provider}, Model: ${model}`);
  }

  // Credential + fallback loop (mirrors handleEmbeddings)
  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;

  while (true) {
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model);

    // All accounts unavailable
    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const errorMsg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        log.warn("SYSTEMONE", `[${provider}/${model}] ${errorMsg} (${credentials.retryAfterHuman})`);
        return unavailableResponse(status, `[${provider}/${model}] ${errorMsg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) {
        log.error("AUTH", `No credentials for provider: ${provider}`);
        return errorResponse(HTTP_STATUS.BAD_REQUEST, `No credentials for provider: ${provider}`);
      }
      log.warn("SYSTEMONE", "No more accounts available", { provider });
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    log.info("AUTH", `\x1b[32mUsing ${provider} account: ${credentials.connectionName}\x1b[0m`);

    const refreshedCredentials = await checkAndRefreshToken(provider, credentials);

    const result = await handleSystemoneCore({
      body,
      modelInfo: { provider, model },
      credentials: refreshedCredentials,
      log,
      onRequestSuccess: async () => {
        await clearAccountError(credentials.connectionId, credentials, model);
      }
    });

    if (result.success) {
      if (result.usage) {
        saveRequestUsage({
          provider,
          model,
          connectionId: credentials.connectionId,
          apiKey,
          endpoint: url.pathname,
          tokens: {
            ...result.usage,
            total_tokens: result.usage.prompt_tokens + result.usage.completion_tokens,
          },
          status: "success",
        }).catch(() => {});
      }
      return result.response;
    }

    const { shouldFallback } = await markAccountUnavailable(credentials.connectionId, result.status, result.error, provider, model);

    if (shouldFallback) {
      log.warn("AUTH", `Account ${credentials.connectionName} unavailable (${result.status}), trying fallback`);
      excludeConnectionIds.add(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;
      continue;
    }

    return result.response;
  }
}
