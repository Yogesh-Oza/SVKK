import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

// Changes on every build so the SW byte-diffs and auto-updates — no manual
// revision bump needed (a forgotten bump was the source of stale-shell bugs).
const BUILD_REVISION = String(Date.now());

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  register: false,
  additionalPrecacheEntries: [
    { url: "/policies", revision: BUILD_REVISION },
    { url: "/policies/new", revision: BUILD_REVISION },
    { url: "/login", revision: BUILD_REVISION },
    { url: "/offline", revision: BUILD_REVISION },
  ],
});

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  // Serwist uses webpack; `next build --webpack` is required (Next 16 defaults to Turbopack).
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/svkk_logo.png" }];
  },
  async redirects() {
    return [
      { source: "/leads", destination: "/dashboard", permanent: false },
      { source: "/leads/:path*", destination: "/dashboard", permanent: false },
      { source: "/follow-ups", destination: "/dashboard", permanent: false },
      { source: "/follow-ups/:path*", destination: "/dashboard", permanent: false },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "github.com",
      },
    ],
  },
};

export default withSerwist(nextConfig);
