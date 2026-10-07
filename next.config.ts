import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["argon2", "sharp", "pg-boss", "exceljs"],
};

export default config;
