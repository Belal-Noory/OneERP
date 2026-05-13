import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@oneerp/i18n", "@oneerp/types"],
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "4000", pathname: "/api/files/**" },
      { protocol: "http", hostname: "127.0.0.1", port: "4000", pathname: "/api/files/**" },
      { protocol: "https", hostname: "**", pathname: "/api/files/**" }
    ]
  }
};

export default nextConfig;
