# syntax=docker/dockerfile:1
# Worker (Temporal) Dockerfile

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
ENV PNPM_CONFIG_PRODUCTION=false
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/api/package.json ./packages/api/
COPY packages/db/package.json ./packages/db/
COPY packages/proto/package.json ./packages/proto/
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

# Production dependencies
FROM base AS prod-deps
ENV PNPM_CONFIG_PRODUCTION=true
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/api/package.json ./packages/api/
COPY packages/db/package.json ./packages/db/
COPY packages/proto/package.json ./packages/proto/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --prod --filter @ducsigr/worker...

# Production image
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker

# Copy production node_modules first (external dependencies)
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy workspace packages directly into node_modules (replacing broken symlinks)
# This ensures Node.js can resolve @ducsigr/* packages without symlinks
COPY --from=builder /app/packages/shared/package.json ./node_modules/@ducsigr/shared/
COPY --from=builder /app/packages/shared/dist ./node_modules/@ducsigr/shared/dist
COPY --from=builder /app/packages/api/package.json ./node_modules/@ducsigr/api/
COPY --from=builder /app/packages/api/dist ./node_modules/@ducsigr/api/dist
COPY --from=builder /app/packages/db/package.json ./node_modules/@ducsigr/db/
COPY --from=builder /app/packages/db/dist ./node_modules/@ducsigr/db/dist
COPY --from=builder /app/packages/proto/package.json ./node_modules/@ducsigr/proto/
COPY --from=builder /app/packages/proto/dist ./node_modules/@ducsigr/proto/dist

# Copy built worker application
COPY --from=builder /app/apps/worker/dist ./dist

# Copy workflow source files (Temporal bundles at runtime)
COPY --from=builder /app/apps/worker/src ./src

USER worker

CMD ["node", "dist/index.js"]
