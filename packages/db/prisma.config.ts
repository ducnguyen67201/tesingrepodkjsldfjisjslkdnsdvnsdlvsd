import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "./prisma/schema",
  datasource: {
    url: process.env.DATABASE_URL!,
  },
  migrate: {
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
