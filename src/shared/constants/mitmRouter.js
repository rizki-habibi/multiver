/**
 * Online 9Router V3 endpoint used by the Kiro MITM path.
 *
 * Override with NINE_ROUTER_V3_BASE_URL or MITM_ROUTER_BASE when a different
 * gateway is desired. The public URL is an endpoint, not a credential.
 */
const DEFAULT_NINE_ROUTER_V3_BASE_URL =
  "https://9router-new-production.up.railway.app";

const DEFAULT_MITM_ROUTER_BASE =
  process.env.MITM_ROUTER_BASE ||
  process.env.NINE_ROUTER_V3_BASE_URL ||
  DEFAULT_NINE_ROUTER_V3_BASE_URL;

module.exports = {
  DEFAULT_NINE_ROUTER_V3_BASE_URL,
  DEFAULT_MITM_ROUTER_BASE,
};
