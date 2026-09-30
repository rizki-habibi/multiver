import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";
import { applyOutboundProxyEnv } from "@/lib/network/outboundProxy";
import { resetComboRotation } from "open-sse/services/combo.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SETTINGS_RESPONSE_HEADERS = {
  "Cache-Control": "no-store"
};

// Secrets must never be mass-assigned from request body (CWE-915)
const PROTECTED_SETTING_KEYS = ["password", "mitmSudoEncrypted"];
const VALID_COMBO_STRATEGIES = new Set(["fallback", "smart", "round-robin", "max", "fusion"]);

export async function GET() {
  try {
    const settings = await getSettings();
    // ponytail: mitmSudoEncrypted is the encrypted sudo password — never in a response body.
    const { password, oidcClientSecret, mitmSudoEncrypted, ...safeSettings } = settings;
    safeSettings.authMode = "github";
    safeSettings.oidcConfigured = false;
    safeSettings.mitmSudoConfigured = !!mitmSudoEncrypted;

    const enableRequestLogs = process.env.ENABLE_REQUEST_LOGS === "true";
    const enableTranslator = process.env.ENABLE_TRANSLATOR === "true";

    return NextResponse.json({
      ...safeSettings,
      enableRequestLogs,
      enableTranslator,
      hasPassword: false,
      githubOnly: true
    }, { headers: SETTINGS_RESPONSE_HEADERS });
  } catch (error) {
    console.log("Error getting settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();

    // Cloud authentication is fixed: GitHub owner only. Password/OIDC/SAML
    // settings are rejected instead of merely hidden from the login page.
    if (body.newPassword || body.currentPassword || body.password) {
      return NextResponse.json({ error: "Password authentication is disabled. Use GitHub owner login." }, { status: 410 });
    }
    for (const key of PROTECTED_SETTING_KEYS) delete body[key];
    for (const key of [
      "authMode", "ssoType", "oidcIssuerUrl", "oidcClientId", "oidcClientSecret",
      "oidcScopes", "oidcLoginLabel", "samlEntryPoint", "samlIssuer", "samlCert",
      "samlLoginLabel", "samlAttributeEmail", "samlAttributeName"
    ]) delete body[key];
    body.requireLogin = true;


    if (Object.prototype.hasOwnProperty.call(body, "oidcClientSecret")) {
      if (!body.oidcClientSecret || !String(body.oidcClientSecret).trim()) {
        delete body.oidcClientSecret;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "comboStrategy")) {
      const strategy = String(body.comboStrategy || "").trim().toLowerCase();
      if (!VALID_COMBO_STRATEGIES.has(strategy)) {
        return NextResponse.json({ error: "Invalid combo strategy" }, { status: 400 });
      }
      body.comboStrategy = strategy;
    }

    if (Object.prototype.hasOwnProperty.call(body, "comboStrategies")) {
      if (!body.comboStrategies || typeof body.comboStrategies !== "object" || Array.isArray(body.comboStrategies)) {
        return NextResponse.json({ error: "comboStrategies must be an object" }, { status: 400 });
      }
      for (const [comboName, config] of Object.entries(body.comboStrategies)) {
        if (!config || typeof config !== "object" || Array.isArray(config)) {
          return NextResponse.json({ error: `Invalid strategy config for combo: ${comboName}` }, { status: 400 });
        }
        if (config.fallbackStrategy !== undefined) {
          const strategy = String(config.fallbackStrategy || "").trim().toLowerCase();
          if (!VALID_COMBO_STRATEGIES.has(strategy)) {
            return NextResponse.json({ error: `Invalid combo strategy for: ${comboName}` }, { status: 400 });
          }
          config.fallbackStrategy = strategy;
        }
      }
    }

    const settings = await updateSettings(body);

    // Apply outbound proxy settings immediately (no restart required)
    if (
      Object.prototype.hasOwnProperty.call(body, "outboundProxyEnabled") ||
      Object.prototype.hasOwnProperty.call(body, "outboundProxyUrl") ||
      Object.prototype.hasOwnProperty.call(body, "outboundNoProxy")
    ) {
      applyOutboundProxyEnv(settings);
    }

    // Invalidate combo rotation state when strategy settings change
    if (
      Object.prototype.hasOwnProperty.call(body, "comboStrategy") ||
      Object.prototype.hasOwnProperty.call(body, "comboStickyRoundRobinLimit") ||
      Object.prototype.hasOwnProperty.call(body, "comboStrategies")
    ) {
      resetComboRotation();
    }

    // ponytail: mitmSudoEncrypted is the encrypted sudo password for the MITM proxy —
    // same class as oidcClientSecret. Keep it out of every settings response body.
    const { password, oidcClientSecret, mitmSudoEncrypted, ...safeSettings } = settings;
    safeSettings.authMode = "github";
    safeSettings.oidcConfigured = false;
    safeSettings.hasPassword = false;
    safeSettings.githubOnly = true;
    safeSettings.mitmSudoConfigured = !!mitmSudoEncrypted;
    return NextResponse.json(safeSettings, { headers: SETTINGS_RESPONSE_HEADERS });
  } catch (error) {
    console.log("Error updating settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
