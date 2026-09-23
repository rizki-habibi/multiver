/**
 * Fusion Engine - Multi-AI Parallel Routing (Combo Mode 4)
 * 
 * Dispatches chat requests to multiple AI providers simultaneously,
 * aggregates responses, and returns fused/merged output.
 */

import { AI_PROVIDERS } from "../shared/constants/providers.js";
import { normalizeProviderId } from "./providerNormalization.js";

// Default timeout for individual provider requests (ms)
const DEFAULT_NODE_TIMEOUT_MS = 60000;

// Minimum responses needed before fusing
const MIN_SUCCESSFUL_RESPONSES = 1;

/**
 * Result from a single provider dispatch
 */
export class FusionNodeResult {
  constructor(providerId, modelId) {
    this.providerId = providerId;
    this.modelId = modelId;
    this.status = 'pending'; // pending | success | error | timeout
    this.response = null;
    this.errorMessage = null;
    this.startTime = Date.now();
    this.endTime = null;
    this.latencyMs = null;
  }

  markSuccess(response) {
    this.status = 'success';
    this.response = response;
    this.endTime = Date.now();
    this.latencyMs = this.endTime - this.startTime;
  }

  markError(error) {
    this.status = 'error';
    this.errorMessage = error?.message || String(error);
    this.endTime = Date.now();
    this.latencyMs = this.endTime - this.startTime;
  }

  markTimeout() {
    this.status = 'timeout';
    this.errorMessage = 'Request timed out';
    this.endTime = Date.now();
    this.latencyMs = this.endTime - this.startTime;
  }
}

/**
 * Dispatches the same prompt to multiple providers in parallel
 */
export async function dispatchToFusionProviders(prompts, models, options = {}) {
  const {
    timeoutMs = DEFAULT_NODE_TIMEOUT_MS,
    abortSignal = null,
  } = options;

  const nodes = models.map(modelId => new FusionNodeResult(null, modelId));
  const dispatchPromises = nodes.map(async (node, index) => {
    try {
      if (abortSignal?.aborted) {
        node.status = 'aborted';
        return;
      }

      // Normalize provider/model
      const providerId = normalizeProviderId(modelId.split('/')[0]);
      const modelName = modelId.split('/').slice(1).join('/');
      node.providerId = providerId;

      // Dispatch through fusion handler
      const result = await dispatchToProvider(providerId, modelName, prompts);
      node.markSuccess(result);
    } catch (error) {
      if (error.name === 'AbortError' || abortSignal?.aborted) {
        node.status = 'aborted';
      } else {
        node.markError(error);
      }
    }
  });

  // Wait for all with timeout
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Fusion dispatch timeout')), timeoutMs);
  });

  try {
    await Promise.race([Promise.all(dispatchPromises), timeoutPromise]);
  } catch {
    // Timeout or abort handled per-node
  }

  return nodes;
}

/**
 * Dispatch to single provider (placeholder - actual implementation depends on routing)
 */
async function dispatchToProvider(providerId, modelName, prompts) {
  // Placeholder implementation - actual routing depends on integration
  // This will be called by the actual routing layer
  throw new Error('Provider dispatch not implemented - integrate with routing layer');
}

/**
 * Fuses multiple provider responses into a single output
 * 
 * Strategy: Take fastest response with successful status, or aggregate if requested
 */
export function fuseResponses(nodeResults, strategy = 'fastest') {
  const successful = nodeResults.filter(n => n.status === 'success');
  if (successful.length === 0) {
    const errors = nodeResults.filter(n => n.status === 'error' || n.status === 'timeout');
    throw new Error(`All providers failed: ${errors.map(e => e.errorMessage).join('; ')}`);
  }

  if (strategy === 'fastest') {
    return successful.sort((a, b) => a.latencyMs - b.latencyMs)[0].response;
  }

  if (strategy === 'best') {
    // Score by quality (placeholder - would need scoring logic)
    return successful[0].response;
  }

  if (strategy === 'aggregate') {
    // Return all responses combined
    return {
      fused: true,
      responses: successful.map(n => ({
        provider: n.providerId,
        model: n.modelId,
        response: n.response,
        latencyMs: n.latencyMs,
      })),
    };
  }

  return successful[0].response;
}

/**
 * Score a response for quality (placeholder - extend with actual logic)
 */
export function scoreResponse(response) {
  // Basic scoring - could be extended with safety filters, coherence checks, etc.
  return {
    coherence: 1.0,
    safety: 1.0,
    relevance: 1.0,
    total: 1.0,
  };
}

/**
 * Get available providers that support fusion
 */
export function getFusionEligibleProviders() {
  const providers = [];
  for (const [id, config] of Object.entries(AI_PROVIDERS)) {
    if (config.enabled !== false) {
      providers.push({
        id,
        name: config.name || id,
        compatible: true, // Extend with compatibility checks if needed
      });
    }
  }
  return providers;
}
