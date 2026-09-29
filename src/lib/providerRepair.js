import {
  getProviderConnections,
  getProviderNodes,
  updateProviderConnection,
  updateProviderNode,
} from "@/models";
import {
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
} from "@/shared/constants/providers";

function normalizeBaseUrl(value) {
  if (typeof value !== "string") return "";
  let url = value.trim().replace(/\/+$/, "");
  url = url.replace(/\/v1\/v1(?=\/|$)/i, "/v1");
  for (const suffix of [
    "/chat/completions",
    "/responses",
    "/messages",
    "/models",
    "/count_tokens",
  ]) {
    if (url.toLowerCase().endsWith(suffix)) {
      url = url.slice(0, -suffix.length).replace(/\/+$/, "");
      break;
    }
  }
  return url;
}

function compatibleProtocol(node) {
  if (node?.type === "anthropic-compatible" || isAnthropicCompatibleProvider(node?.id)) {
    return "anthropic";
  }
  return "openai";
}

function compatibleLabel(node) {
  return compatibleProtocol(node) === "anthropic"
    ? "Kompatibel (Messages)"
    : "Kompatibel (Chat)";
}

/**
 * Local-only repair for compatible services.
 * It never changes/deletes API keys and never calls an upstream provider.
 */
export async function repairProviderData() {
  const [nodes, connections] = await Promise.all([
    getProviderNodes(),
    getProviderConnections(),
  ]);

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const stats = {
    scannedNodes: nodes.length,
    scannedConnections: connections.length,
    repairedNodes: 0,
    repairedConnections: 0,
    unchangedNodes: 0,
    unchangedConnections: 0,
    skipped: 0,
  };

  for (const node of nodes) {
    const compatible =
      node?.type === "openai-compatible" ||
      node?.type === "anthropic-compatible" ||
      isOpenAICompatibleProvider(node?.id) ||
      isAnthropicCompatibleProvider(node?.id);

    if (!compatible) {
      stats.skipped++;
      continue;
    }

    const protocol = compatibleProtocol(node);
    const normalizedBaseUrl = normalizeBaseUrl(node.baseUrl);
    const nextApiType =
      node.type === "openai-compatible"
        ? (node.apiType === "responses" ? "responses" : "chat")
        : undefined;

    const changed =
      node.compatibility !== "compatible" ||
      node.compatibilityLabel !== compatibleLabel(node) ||
      node.protocol !== protocol ||
      (normalizedBaseUrl && node.baseUrl !== normalizedBaseUrl) ||
      (node.type === "openai-compatible" && node.apiType !== nextApiType);

    if (changed) {
      const updated = await updateProviderNode(node.id, {
        compatibility: "compatible",
        compatibilityLabel: compatibleLabel(node),
        protocol,
        ...(normalizedBaseUrl ? { baseUrl: normalizedBaseUrl } : {}),
        ...(node.type === "openai-compatible" ? { apiType: nextApiType } : {}),
      });
      nodeMap.set(node.id, updated || { ...node, baseUrl: normalizedBaseUrl || node.baseUrl });
      stats.repairedNodes++;
    } else {
      stats.unchangedNodes++;
    }
  }

  for (const connection of connections) {
    const node = nodeMap.get(connection.provider);
    if (!node) continue;

    const compatible =
      node.type === "openai-compatible" ||
      node.type === "anthropic-compatible" ||
      isOpenAICompatibleProvider(connection.provider) ||
      isAnthropicCompatibleProvider(connection.provider);

    if (!compatible) continue;

    const protocol = compatibleProtocol(node);
    const current = connection.providerSpecificData || {};
    const nextData = {
      ...current,
      compatibility: "compatible",
      compatibilityLabel: compatibleLabel(node),
      protocol,
      prefix: node.prefix ?? current.prefix,
      baseUrl: node.baseUrl ?? current.baseUrl,
      nodeName: node.name ?? current.nodeName,
    };

    if (node.type === "openai-compatible") {
      nextData.apiType = node.apiType === "responses" ? "responses" : "chat";
    } else {
      delete nextData.apiType;
    }

    const changed =
      current.compatibility !== nextData.compatibility ||
      current.compatibilityLabel !== nextData.compatibilityLabel ||
      current.protocol !== nextData.protocol ||
      current.prefix !== nextData.prefix ||
      current.baseUrl !== nextData.baseUrl ||
      current.nodeName !== nextData.nodeName ||
      (node.type === "openai-compatible" && current.apiType !== nextData.apiType) ||
      (node.type === "anthropic-compatible" && Object.hasOwn(current, "apiType"));

    if (changed) {
      await updateProviderConnection(connection.id, {
        providerSpecificData: nextData,
      });
      stats.repairedConnections++;
    } else {
      stats.unchangedConnections++;
    }
  }

  return stats;
}
