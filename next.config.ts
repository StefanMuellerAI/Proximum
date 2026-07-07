import type { NextConfig } from "next";

/**
 * Security-Header fuer alle Routen. Kein CSP-Header: Clerk (Sign-in-Widgets)
 * benoetigt eine aufwendige Allowlist; bei Bedarf spaeter als Report-Only
 * einfuehren.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["fflate"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
