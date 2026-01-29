import type { NextConfig } from "next";

// Validate environment variables
import "./src/lib/env";

const nextConfig: NextConfig = {
  // Required for Docker deployments - creates a standalone build with all dependencies
  output: "standalone",
  transpilePackages: ["@ducsigr/shared", "@ducsigr/db", "@ducsigr/api", "@ducsigr/proto"],
};

export default nextConfig;
