import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera .next/standalone: só o necessário para rodar, usado pelo Dockerfile.
  output: "standalone",
};

export default nextConfig;
