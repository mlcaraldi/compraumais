import type { NextConfig } from "next";

const config: NextConfig = {
  // Vercel limita o corpo de requisição a 4,5 MB
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  serverExternalPackages: ["argon2", "sharp", "pg-boss", "exceljs"],
};

export default config;
