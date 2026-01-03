# syntax=docker/dockerfile:1
# Worker (Temporal) Dockerfile
# Note: Using node:24-slim (Debian) instead of Alpine because
# Temporal SDK requires glibc (Alpine uses musl)

FROM node:24-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/api/package.json ./packages/api/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/config-eslint/package.json ./packages/config-eslint/
COPY packages/config-typescript/package.json ./packages/config-typescript/
COPY packages/config-typescript/*.json ./packages/config-typescript/
RUN pnpm install --frozen-lockfile

# Build
FROM base AS builder
COPY --from=deps /app ./
COPY . .

# Generate Prisma client
RUN pnpm --filter @ducsigr/db db:generate

# Build the worker app (use turbo to build dependencies first)
RUN pnpm turbo run build --filter=@ducsigr/worker

# Prune dev dependencies while preserving structure
RUN pnpm prune --prod

# Production image
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install CA certificates for TLS connections (required for Temporal Cloud)
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs worker

# Copy node_modules from builder (already pruned, with correct structure)
COPY --from=builder /app/node_modules ./node_modules

# Copy workspace packages directly into node_modules (replacing symlinks)
COPY --from=builder /app/packages/shared/package.json ./node_modules/@ducsigr/shared/
COPY --from=builder /app/packages/shared/dist ./node_modules/@ducsigr/shared/dist
COPY --from=builder /app/packages/api/package.json ./node_modules/@ducsigr/api/
COPY --from=builder /app/packages/api/dist ./node_modules/@ducsigr/api/dist
COPY --from=builder /app/packages/db/package.json ./node_modules/@ducsigr/db/
COPY --from=builder /app/packages/db/dist ./node_modules/@ducsigr/db/dist

# Copy @prisma/client into @ducsigr/db's node_modules for Prisma 7 resolution
# The generated Prisma code imports @prisma/client/runtime/client
COPY --from=builder /app/node_modules/@prisma ./node_modules/@ducsigr/db/node_modules/@prisma

# Copy built worker application
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist

# Copy workflow source files (Temporal bundles at runtime)
COPY --from=builder /app/apps/worker/src ./apps/worker/src

USER worker

WORKDIR /app/apps/worker

CMD ["node", "dist/index.js"]
