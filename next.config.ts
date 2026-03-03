import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright"],
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
