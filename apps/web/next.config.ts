import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@t3/api", "@t3/db", "@t3/shared", "@t3/queue"],
};

export default config;
