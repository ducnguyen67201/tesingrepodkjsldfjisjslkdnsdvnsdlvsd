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
  // Copy generated Prisma sources, then emit JS and fix ESM import specifiers.
  onSuccess: async () => {
    const { execSync } = await import("child_process");
    execSync("cp -r src/generated dist/", { stdio: "inherit" });
    execSync("tsc -p tsconfig.generated.json", { stdio: "inherit" });
    execSync('tsc-alias -p tsconfig.json --resolve-full-paths --inputglob "{js,mjs,cjs}"', {
      stdio: "inherit",
    });
  },
});
