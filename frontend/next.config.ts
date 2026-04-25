import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Reduces "Invalid source map" warnings from dependencies
  productionBrowserSourceMaps: false,
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/favicon.png" }];
  },
  async redirects() {
    return [
      { source: "/leads", destination: "/dashboard", permanent: false },
      { source: "/leads/:path*", destination: "/dashboard", permanent: false },
      { source: "/follow-ups", destination: "/dashboard", permanent: false },
      { source: "/follow-ups/:path*", destination: "/dashboard", permanent: false },
      { source: "/policies/new", destination: "/calculator", permanent: false },
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

export default nextConfig;
