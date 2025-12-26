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
COPY apps/ingest-node/package.json apps/ingest-node/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/db packages/db
COPY packages/shared packages/shared
COPY packages/api packages/api
COPY apps/ingest-node apps/ingest-node

# Generate Prisma client
RUN pnpm --filter @ducsigr/db db:generate

# Build ingest-node
RUN pnpm --filter @ducsigr/ingest-node build

# Production stage
FROM node:24-alpine AS runner

# Install pnpm for production dependencies
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 ingest

# Copy package files
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/db/package.json packages/db/
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/api/package.json packages/api/
COPY --from=builder /app/apps/ingest-node/package.json apps/ingest-node/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files
COPY --from=builder /app/packages/db/dist packages/db/dist
COPY --from=builder /app/packages/db/prisma packages/db/prisma
COPY --from=builder /app/node_modules/.prisma node_modules/.prisma
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/api/dist packages/api/dist
COPY --from=builder /app/apps/ingest-node/dist apps/ingest-node/dist

# Set ownership
RUN chown -R ingest:nodejs /app

USER ingest

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "apps/ingest-node/dist/index.js"]
