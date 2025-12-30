import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
    schemas: "src/schemas.ts",
    "lib/cost/index": "src/lib/cost/index.ts",
    "lib/alerting/index": "src/lib/alerting/index.ts",
    "lib/alerting/init": "src/lib/alerting/init.ts",
    "lib/github/index": "src/lib/github/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  external: [
    "@ducsigr/db",
    "@ducsigr/shared",
    "@temporalio/client",
    "@trpc/server",
    "date-fns",
    "nodemailer",
    "superjson",
    "zod",
    "next-auth",
  ],
});
