# Dockerfile.app
#
# Ducsigr Application Container (Web + Worker + Ingest)
# For use with Docker Compose (separate infrastructure containers)
#
# Usage:
#   docker build -f Dockerfile.app -t ducsigr-app:latest .
#   docker compose up -d

# ============================================================
# Stage 1: Build Node.js Applications
# ============================================================
FROM node:24-alpine AS node-builder

RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY apps/ingest-node/package.json ./apps/ingest-node/
COPY packages/db/package.json ./packages/db/
COPY packages/db/prisma ./packages/db/prisma/
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/proto/package.json ./packages/proto/
COPY packages/config-eslint/package.json ./packages/config-eslint/
COPY packages/config-typescript/package.json ./packages/config-typescript/
COPY packages/config-typescript/*.json ./packages/config-typescript/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client
RUN pnpm --filter @ducsigr/db db:generate

# Build all workspace packages with turbo (handles dependency order)
RUN pnpm turbo run build --filter=@ducsigr/shared --filter=@ducsigr/db --filter=@ducsigr/api --filter=@ducsigr/proto

# Build Web (Next.js with standalone output)# Provide dummy env vars for build time - actual values are set at runtime
ENV NEXTAUTH_SECRET="build-time-placeholder-secret-min-32-chars"
ENV JWT_SHARED_SECRET="build-time-placeholder-secret-min-32-chars"
ENV INTERNAL_API_SECRET="build-time-placeholder-secret-min-32-chars"
ENV NEXTAUTH_URL="http://localhost:3000"
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

RUN pnpm turbo run build --filter=@ducsigr/web

# Build Worker
RUN pnpm turbo run build --filter=@ducsigr/worker

# Build Ingest Node
RUN pnpm turbo run build --filter=@ducsigr/ingest-node

# ============================================================
# Stage 2: Production Runtime
# ============================================================
FROM node:24-alpine AS runtime

# Install runtime dependencies
RUN apk add --no-cache \
    supervisor \
    wget \
    openssl \
    netcat-openbsd \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -S ducsigr && adduser -S ducsigr -G ducsigr

WORKDIR /app

# Copy Node.js artifacts
COPY --from=node-builder /app/apps/web/.next/standalone ./
COPY --from=node-builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=node-builder /app/apps/web/public ./apps/web/public
COPY --from=node-builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=node-builder /app/apps/ingest-node/dist ./apps/ingest-node/dist
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/packages ./packages

# Copy configuration files
COPY docker/production/supervisord.conf /etc/supervisord.conf
COPY docker/production/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create directories
RUN mkdir -p /app/secrets \
    && chown -R ducsigr:ducsigr /app

# Switch to non-root user
USER ducsigr

# Expose ports
# 3000 - Web Dashboard & API
# 8080 - Ingest API (for SDKs)
EXPOSE 3000 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
