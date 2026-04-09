import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@oneerp/i18n", "@oneerp/types"]
};

export default nextConfig;
