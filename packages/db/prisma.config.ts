import { join } from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: join(__dirname, "prisma/schema"),
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
