# syntax=docker/dockerfile:1
# Ingest (Express/Node.js) Dockerfile

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
ENV PNPM_CONFIG_PRODUCTION=false
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/ingest-node/package.json ./apps/ingest-node/
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
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN pnpm --filter @ducsigr/db db:generate

# Build the ingest app
RUN pnpm --filter @ducsigr/ingest-node build

# Production image
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 ingest

# Copy built application
COPY --from=builder /app/apps/ingest-node/dist ./dist
COPY --from=builder /app/apps/ingest-node/package.json ./
COPY --from=builder /app/node_modules ./node_modules

USER ingest

EXPOSE 3001
ENV PORT=3001

CMD ["node", "dist/index.js"]
