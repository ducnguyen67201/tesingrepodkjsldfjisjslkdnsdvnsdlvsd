# Build stage
FROM node:24-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/proto/package.json packages/proto/
COPY apps/worker/package.json apps/worker/

# Install dependencies (including dev for building)
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/db packages/db
COPY packages/shared packages/shared
COPY packages/api packages/api
COPY packages/proto packages/proto
COPY apps/worker apps/worker

# Generate Prisma client
RUN pnpm --filter @ducsigr/db db:generate

# Build all packages
RUN pnpm --filter @ducsigr/worker... build

# Dependencies stage - for production node_modules
FROM node:24-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/proto/package.json packages/proto/
COPY apps/worker/package.json apps/worker/

# Production deps only
RUN pnpm install --frozen-lockfile --prod

# Production stage
FROM node:24-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 worker

# Copy production node_modules
COPY --from=deps /app ./

# Copy built packages
COPY --from=builder /app/packages/db/dist packages/db/dist
COPY --from=builder /app/packages/db/prisma packages/db/prisma
COPY --from=builder /app/node_modules/.prisma node_modules/.prisma
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/api/dist packages/api/dist
COPY --from=builder /app/packages/proto/dist packages/proto/dist
COPY --from=builder /app/apps/worker/dist apps/worker/dist

# Copy workflow source files (Temporal bundles at runtime)
COPY --from=builder /app/apps/worker/src apps/worker/src

RUN chown -R worker:nodejs /app

USER worker

ENV NODE_ENV=production

CMD ["node", "apps/worker/dist/index.js"]
