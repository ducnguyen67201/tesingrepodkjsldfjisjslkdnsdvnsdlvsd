import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/vector.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  // Don't bundle Prisma - it has its own generated code
  noExternal: [],
  external: [
    "@prisma/adapter-pg",
    "@prisma/client",
    "@prisma/client-runtime-utils",
    "pg",
    "dotenv",
    // Mark the generated Prisma client as external
    /\.\/generated\/.*/,
  ],
  // Copy the generated Prisma files
  onSuccess: async () => {
    const { execSync } = await import("child_process");
    execSync("cp -r src/generated dist/", { stdio: "inherit" });
  },
});
