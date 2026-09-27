"use client";

import { useState, useEffect } from "react";
import { MITM_TOOLS } from "@/shared/constants/cliTools";
import { getModelsByProviderId } from "@/shared/constants/models";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";
import { MitmServerCard, MitmToolCard } from "../../mitm/components";

export default function MitmTab() {
  const [connections, setConnections] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [modelAliases, setModelAliases] = useState({});
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [expandedTool, setExpandedTool] = useState(null);
  const [mitmStatus, setMitmStatus] = useState({ running: false, certExists: false, dnsStatus: {}, hasCachedPassword: false });

  useEffect(() => {
    fetch("/api/providers").then(r => r.json()).then(d => setConnections(d.connections || [])).catch(() => { });
    fetch("/api/keys").then(r => r.json()).then(d => setApiKeys(d.keys || [])).catch(() => { });
    fetch("/api/models/alias").then(r => r.json()).then(d => setModelAliases(d.aliases || {})).catch(() => { });
    fetch("/api/settings").then(r => r.json()).then(d => setCloudEnabled(d.cloudEnabled || false)).catch(() => { });
  }, []);

  const getActiveProviders = () => connections.filter(c => c.isActive !== false);
  const hasActiveProviders = () => getActiveProviders().some(conn =>
    getModelsByProviderId(conn.provider).length > 0 ||
    isOpenAICompatibleProvider(conn.provider) ||
    isAnthropicCompatibleProvider(conn.provider)
  );

  const mitmTools = Object.entries(MITM_TOOLS);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
        <span className="material-symbols-outlined text-[16px] text-yellow-500 mt-0.5 shrink-0">warning</span>
        <p className="text-xs text-red-600 dark:text-yellow-400 leading-relaxed">
          ⚠️ Kiro MITM menyadap lalu lintas HTTPS Kiro IDE melalui CA lokal untuk mengarahkan request ke penyedia Anda. Dapat melanggar ToS → akun terblokir. Risiko ditanggung sendiri.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-text-muted">
          Setelah MITM berjalan dan CA terpasang, buka Kiro IDE agar request-nya lewat MITM ke Multiver (port 20222).
        </p>
        <a
          href="kiro://"
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:opacity-90 inline-flex items-center gap-1.5 transition-opacity shrink-0"
        >
          <span className="material-symbols-outlined text-[16px]">open_in_new</span>
          Buka Kiro IDE
        </a>
      </div>

      <MitmServerCard apiKeys={apiKeys} cloudEnabled={cloudEnabled} onStatusChange={setMitmStatus} />

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
