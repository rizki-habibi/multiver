/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: { unoptimized: true },
  async rewrites() {
    // Root-level public API mirror. The LLM API handlers live under /api/v1 and
    // /api/v1beta, but clients (README, skills, and the Kiro MITM handler in
    // src/mitm/handlers/base.js) call /v1 and /v1beta directly. dashboardGuard.js
    // already lists both prefixes as public LLM API, so rewrite rather than
    // moving the handlers.
    return {
      beforeFiles: [
        { source: "/v1/:path*", destination: "/api/v1/:path*" },
        { source: "/v1beta/:path*", destination: "/api/v1beta/:path*" },
      ],
    };
  },
};

export default nextConfig;
