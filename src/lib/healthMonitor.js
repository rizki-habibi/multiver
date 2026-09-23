/**
 * Health Monitor - Automatic Suspended Account Detection & Failover
 * 
 * Monitors provider accounts (specifically AWS Bedrock/Kiro and Google Vertex/Gemini)
 * for signs of suspension, quota exhaustion, or permanent bans.
 * Automatically disables affected credentials and logs the reason.
 */

import { getSettings, updateProviderCredentials } from "./localDb.js";
import * as log from "../sse/utils/logger.js";

// Error patterns indicating a suspended/banned/disabled account
const SUSPENSION_PATTERNS = [
  // AWS / Kiro specific
  /account.*suspend/i,
  /access.*denied.*quota/i,
  /throttlingexception.*limit.*exceeded/i,
  /resource.*not.*found.*project/i, // Often means project disabled/deleted
  /unauthorizedoperation.*account/i,
  
  // Google Cloud / Gemini specific
  /permission.*denied.*serviceusage/i,
  /billing.*closed/i,
  /api_key_invalid.*disabled/i,
  /quota_exceeded.*hard_limit/i,
  /user_disabled/i,
  /project_deleted/i,

  // General "Permanent" Ban indicators
  /permanently.*banned/i,
  /violated.*terms.*of.*service/i,
  /fraudulent.*activity/i,
];

// Cooldown duration for auto-disabled accounts (24 hours by default)
const DISABLE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Analyze an error response to determine if it indicates a suspended account.
 * @param {number} status - HTTP Status Code
 * @param {string|object} errorBody - The error message or JSON body
 * @param {string} providerId - Provider identifier (e.g., 'kiro', 'gemini')
 * @returns {{ isSuspended: boolean, reason: string }}
 */
export function analyzeSuspensionRisk(status, errorBody, providerId) {
  const errorMessage = typeof errorBody === "string" ? errorBody : JSON.stringify(errorBody);
  
  // Only check on 4xx errors (client/auth issues), not 5xx (server/transient)
  if (status < 400 || status >= 500) {
    return { isSuspended: false, reason: "" };
  }

  for (const pattern of SUSPENSION_PATTERNS) {
    if (pattern.test(errorMessage)) {
      log.warn("HEALTH_MONITOR", `Potential suspension detected for ${providerId}: ${errorMessage.substring(0, 100)}...`);
      return {
        isSuspended: true,
        reason: `Auto-disabled due to suspected suspension: ${pattern.source}`
      };
    }
  }

  return { isSuspended: false, reason: "" };
}

/**
 * Mark an account as unavailable/suspended in the database.
 * @param {string} connectionId - Unique ID of the credential/connection
 * @param {string} reason - Human-readable reason for disabling
 */
export async function disableAccount(connectionId, reason) {
  try {
    const untilDate = new Date(Date.now() + DISABLE_COOLDOWN_MS).toISOString();
    
    await updateProviderCredentials(connectionId, {
      status: "suspended",
      rateLimitedUntil: untilDate,
      lastError: {
        status: 403, // Generic forbidden for suspension
        message: reason,
        timestamp: new Date().toISOString(),
        type: "auto_suspension_detected"
      },
      backoffLevel: 99 // High level to prevent quick retry
    });

    log.info("HEALTH_MONITOR", `Account ${connectionId} automatically disabled until ${untilDate}. Reason: ${reason}`);
  } catch (error) {
    log.error("HEALTH_MONITOR", `Failed to disable account ${connectionId}`, { error: error.message });
  }
}

/**
 * Background task to periodically verify health of recently suspended accounts.
 * This can be hooked into the main instrumentation loop.
 */
export async function runHealthCheckCycle() {
  const settings = await getSettings();
  if (!settings.enableHealthMonitor) return;

  // Implementation detail: Query DB for accounts with status='suspended' 
  // and attempt a lightweight ping (e.g., list models) to see if they recover.
  // For now, this serves as the entry point for future expansion.
  log.debug("HEALTH_MONITOR", "Running scheduled health check cycle...");
}
