import path from 'node:path';
import { defineConfig } from 'prisma/config';
import { config } from 'dotenv';

// Load .env from project root
config({ path: path.join(import.meta.dirname, '..', '..', '.env') });

// DATABASE_URL is optional for `prisma generate`, required for `prisma db push/migrate`
const databaseUrl = process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

export default defineConfig({
  earlyAccess: true,
  schema: path.join(import.meta.dirname, 'prisma', 'schema'),
  datasource: {
    url: databaseUrl,
  },
});
