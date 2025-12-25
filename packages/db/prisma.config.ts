import path from 'node:path';
import { defineConfig } from 'prisma/config';
import { config } from 'dotenv';

// Load .env from project root
config({ path: path.join(import.meta.dirname, '..', '..', '.env') });

// DATABASE_URL is optional for `prisma generate`, required for `prisma db push/migrate`
const databaseUrl = process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

// Shadow database for migrations - uses same connection with _shadow suffix
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL || databaseUrl.replace(/\/([^/]+)$/, '/$1_shadow');

export default defineConfig({
  schema: path.join(import.meta.dirname, 'prisma', 'schema'),
  datasource: {
    url: databaseUrl,
    shadowDatabaseUrl,
  },
});
