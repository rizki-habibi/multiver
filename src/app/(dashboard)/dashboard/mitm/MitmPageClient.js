"use client";

import { useState, useEffect } from "react";
import { MITM_TOOLS } from "@/shared/constants/cliTools";
import { getModelsByProviderId } from "@/shared/constants/models";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";
import { MitmServerCard, MitmToolCard } from "./components";

export default function MitmPageClient() {
  const [connections, setConnections] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [modelAliases, setModelAliases] = useState({});
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [expandedTool, setExpandedTool] = useState(null);
  const [mitmStatus, setMitmStatus] = useState({ running: false, certExists: false, dnsStatus: {}, hasCachedPassword: false });

  useEffect(() => {
    fetchConnections();
    fetchApiKeys();
    fetchAliases();
    fetchCloudSettings();
  }, []);

  const fetchConnections = async () => {
    try {
      const res = await fetch("/api/providers");
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections || []);
      }
    } catch { /* ignore */ }
  };

  const fetchApiKeys = async () => {
    try {
      const res = await fetch("/api/keys");
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data.keys || []);
      }
    } catch { /* ignore */ }
  };

  const fetchAliases = async () => {
    try {
      const res = await fetch("/api/models/alias");
      if (res.ok) {
        const data = await res.json();
        setModelAliases(data.aliases || {});
      }
    } catch { /* ignore */ }
  };

  const fetchCloudSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setCloudEnabled(data.cloudEnabled || false);
      }
    } catch { /* ignore */ }
  };

  const getActiveProviders = () => connections.filter(c => c.isActive !== false);

  const hasActiveProviders = () => {
    const active = getActiveProviders();
    return active.some(conn =>
      getModelsByProviderId(conn.provider).length > 0 ||
      isOpenAICompatibleProvider(conn.provider) ||
      isAnthropicCompatibleProvider(conn.provider)
    );
  };

  const mitmTools = Object.entries(MITM_TOOLS);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
        <span className="material-symbols-outlined text-[16px] text-yellow-500 mt-0.5 shrink-0">warning</span>
        <p className="text-xs text-red-600 dark:text-yellow-400 leading-relaxed">
          ⚠️ Kiro MITM intercepts HTTPS traffic of Kiro IDE via local CA to redirect requests to your providers. May violate ToS → account ban. Use at your own risk.
        </p>
      </div>

      {/* Step 0: launch Kiro IDE once MITM is armed, so it picks up the CA + DNS */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-text-muted">
          Setelah MITM berjalan dan CA terpasang, buka Kiro IDE agar request-nya lewat MITM ke Multiver (port 20222).
        </p>
        <a
          href="kiro://"
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:opacity-90 inline-flex items-center gap-1.5 transition-opacity shrink-0"
          title="Luncurkan Kiro IDE via custom protocol"
        >
          <span className="material-symbols-outlined text-[16px]">open_in_new</span>
          Buka Kiro IDE
        </a>
      </div>

      {/* MITM Server Card */}
      <MitmServerCard
        apiKeys={apiKeys}
        cloudEnabled={cloudEnabled}
        onStatusChange={setMitmStatus}
      />

      {/* Tool Cards */}
      <div className="grid gap-3 sm:gap-4">
        {mitmTools.map(([toolId, tool]) => (
          <MitmToolCard
            key={toolId}
            tool={tool}
            isExpanded={expandedTool === toolId}
            onToggle={() => setExpandedTool(expandedTool === toolId ? null : toolId)}
            serverRunning={mitmStatus.running}
            dnsActive={mitmStatus.dnsStatus?.[toolId] || false}
            hasCachedPassword={mitmStatus.hasCachedPassword || false}
            needsSudoPassword={mitmStatus.needsSudoPassword !== false}
            isWin={mitmStatus.isWin === true}
            apiKeys={apiKeys}
            activeProviders={getActiveProviders()}
            hasActiveProviders={hasActiveProviders()}
            modelAliases={modelAliases}
            cloudEnabled={cloudEnabled}
            onDnsChange={(data) => setMitmStatus(prev => ({ ...prev, dnsStatus: data.dnsStatus ?? prev.dnsStatus }))}
          />
        ))}
      </div>
    </div>
  );
}
