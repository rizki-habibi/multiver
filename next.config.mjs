/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: { unoptimized: true },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/v1/:path*", destination: "/api/v1/:path*" },
        { source: "/v1beta/:path*", destination: "/api/v1beta/:path*" },
      ],
    };
  },
};
export default nextConfig;
