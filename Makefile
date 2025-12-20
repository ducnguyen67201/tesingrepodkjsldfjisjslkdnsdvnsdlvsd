.PHONY: setup proto proto-lint proto-breaking install-buf dev build clean check-doppler doppler-setup doppler-check install-hooks

# ============================================================================
# QUICK START
# ============================================================================

# One command setup - installs everything and starts infrastructure
setup:
	@./scripts/setup.sh

# ============================================================================
# DOPPLER (Secret Management)
# ============================================================================

# Check if Doppler CLI is installed
check-doppler:
	@which doppler > /dev/null || (echo "❌ Doppler CLI not installed. Run: brew install dopplerhq/cli/doppler" && exit 1)
	@echo "✅ Doppler CLI installed"

# Setup Doppler for this project
doppler-setup: check-doppler
	@doppler setup --no-interactive
	@echo "✅ Doppler configured"

# Verify Doppler can fetch secrets
doppler-check: check-doppler
	@doppler run -- printenv DATABASE_URL > /dev/null 2>&1 && echo "✅ Doppler secrets accessible" || (echo "❌ Cannot fetch Doppler secrets. Run: doppler login && make doppler-setup" && exit 1)

# ============================================================================
# GIT HOOKS
# ============================================================================

# Install git hooks (prevents committing .env files)
install-hooks:
	@cp scripts/pre-commit .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit
	@echo "✅ Git hooks installed"

# ============================================================================
# DEVELOPMENT
# ============================================================================

# Development - run all TypeScript services (requires Doppler)
dev: doppler-check
	pnpm dev

# Development - run ingest service (run in separate terminal)
dev-ingest:
	pnpm --filter @cognobserve/ingest-node dev

# Install all dependencies
install:
	pnpm install

# Format all code
format:
	pnpm format

# ============================================================================
# PROTO / TYPES
# ============================================================================

# Install buf CLI
install-buf:
	@which buf > /dev/null || (echo "Installing buf..." && \
		curl -sSL "https://github.com/bufbuild/buf/releases/download/v1.47.2/buf-$(shell uname -s)-$(shell uname -m)" -o /usr/local/bin/buf && \
		chmod +x /usr/local/bin/buf)

# Generate proto types for all languages
proto:
	make install-buf
	buf generate

# Lint proto files
proto-lint:
	buf lint

# Check for breaking changes
proto-breaking:
	buf breaking --against '.git#branch=main'

# Update buf dependencies
proto-deps:
	buf dep update

# ============================================================================
# DATABASE
# ============================================================================

# Generate Prisma client
db-generate:
	pnpm db:generate

# Push schema to database
db-push:
	pnpm db:push

# Open Prisma Studio
db-studio:
	pnpm db:studio

# ============================================================================
# BUILD
# ============================================================================

# Build all services
build:
	pnpm build

# Clean all build artifacts
clean:
	pnpm clean

# ============================================================================
# DOCKER
# ============================================================================

# Start PostgreSQL and Redis
docker-up:
	docker-compose up -d

# Stop containers
docker-down:
	docker-compose down

# Stop and remove volumes
docker-reset:
	docker-compose down -v

# View logs
docker-logs:
	docker-compose logs -f

# ============================================================================
# HELP
# ============================================================================

help:
	@echo ""
	@echo "CognObserve - AI Observability Platform"
	@echo ""
	@echo "Quick Start:"
	@echo "  make setup          - One command setup (recommended for new devs)"
	@echo ""
	@echo "Doppler (Secret Management):"
	@echo "  make check-doppler  - Check if Doppler CLI is installed"
	@echo "  make doppler-setup  - Configure Doppler for this project"
	@echo "  make doppler-check  - Verify Doppler can fetch secrets"
	@echo ""
	@echo "Git Hooks:"
	@echo "  make install-hooks  - Install pre-commit hook (.env protection)"
	@echo ""
	@echo "Development:"
	@echo "  make dev            - Run TypeScript apps (web, worker)"
	@echo "  make dev-ingest     - Run ingest-node service"
	@echo "  make install        - Install all dependencies"
	@echo "  make format         - Format all code"
	@echo ""
	@echo "Proto/Types:"
	@echo "  make proto          - Generate Go + TypeScript types"
	@echo "  make proto-lint     - Lint proto files"
	@echo "  make install-buf    - Install buf CLI"
	@echo ""
	@echo "Database:"
	@echo "  make db-generate    - Generate Prisma client"
	@echo "  make db-push        - Push schema to database"
	@echo "  make db-studio      - Open Prisma Studio GUI"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up      - Start PostgreSQL + Temporal"
	@echo "  make docker-down    - Stop containers"
	@echo "  make docker-reset   - Stop and remove volumes"
	@echo ""
	@echo "Build:"
	@echo "  make build          - Build all services"
	@echo "  make clean          - Clean build artifacts"
	@echo ""
