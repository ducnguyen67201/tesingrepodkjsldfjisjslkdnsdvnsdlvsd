#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║               Ducsigr Setup Script                    ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}✗ $1 is not installed${NC}"
        echo "  Please install $1: $2"
        exit 1
    else
        echo -e "${GREEN}✓ $1 is installed${NC}"
    fi
}

check_command "node" "https://nodejs.org/"
check_command "pnpm" "npm install -g pnpm"
check_command "docker" "https://www.docker.com/"

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${RED}✗ Node.js version must be 20 or higher (current: $NODE_VERSION)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js version is $NODE_VERSION${NC}"

echo ""
echo -e "${YELLOW}Step 1/5: Installing dependencies...${NC}"
pnpm install

echo ""
echo -e "${YELLOW}Step 2/5: Starting Docker containers (PostgreSQL, Redis)...${NC}"
docker-compose up -d

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
until docker exec ducsigr-postgres pg_isready -U ducsigr > /dev/null 2>&1; do
    sleep 1
done
echo -e "${GREEN}✓ PostgreSQL is ready${NC}"

# Wait for Redis to be ready
echo -e "${YELLOW}Waiting for Redis to be ready...${NC}"
until docker exec ducsigr-redis redis-cli ping > /dev/null 2>&1; do
    sleep 1
done
echo -e "${GREEN}✓ Redis is ready${NC}"

echo ""
echo -e "${YELLOW}Step 3/5: Setting up environment...${NC}"
if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "${GREEN}✓ Created .env file${NC}"
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

echo ""
echo -e "${YELLOW}Step 4/5: Generating Prisma client...${NC}"
pnpm db:generate

echo ""
echo -e "${YELLOW}Step 5/5: Pushing database schema...${NC}"
pnpm db:push

echo ""
echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║                   Setup Complete! 🎉                      ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo ""
echo -e "${BLUE}To start development:${NC}"
echo ""
echo "  Terminal 1 (TypeScript apps):"
echo -e "    ${GREEN}pnpm dev${NC}"
echo ""
echo "  Terminal 2 (Ingest service):"
echo -e "    ${GREEN}make dev-ingest${NC}"
echo ""
echo -e "${BLUE}Services will be available at:${NC}"
echo "  • Web Dashboard:  http://localhost:3000"
echo "  • Ingest API:     http://localhost:8080"
echo "  • Health Check:   http://localhost:8080/health"
echo "  • Metrics:        http://localhost:8080/metrics"
echo ""
echo -e "${BLUE}Useful commands:${NC}"
echo "  • make proto       - Generate proto types"
echo "  • pnpm db:studio   - Open Prisma Studio"
echo "  • make docker-down - Stop containers"
echo ""
