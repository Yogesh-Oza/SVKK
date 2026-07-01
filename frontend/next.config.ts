import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  register: false,
  additionalPrecacheEntries: [
    { url: "/policies", revision: "4" },
    { url: "/policies/new", revision: "1" },
    { url: "/login", revision: "1" },
    { url: "/offline", revision: "1" },
    { url: "/favicon.png", revision: "1" },
  ],
});

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  // Serwist uses webpack; `next build --webpack` is required (Next 16 defaults to Turbopack).
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/favicon.png" }];
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
