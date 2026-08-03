import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/binary packages: không bundle (Turbopack), require lúc runtime (server).
  serverExternalPackages: [
    "@resvg/resvg-js",
    "satori",
    "sharp",
    "@imgly/background-removal-node",
  ],
};

export default nextConfig;
