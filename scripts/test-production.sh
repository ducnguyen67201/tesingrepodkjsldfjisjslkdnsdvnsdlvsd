#!/bin/bash
# scripts/test-production.sh
#
# Integration test for Ducsigr Production (Docker Compose) setup

set -e

echo "=========================================="
echo "  Ducsigr Production Integration Test"
echo "=========================================="
echo ""

COMPOSE_FILE="docker-compose.self-hosted.yml"

cleanup() {
    echo ""
    echo "[Cleanup] Stopping and removing containers..."
    docker compose -f $COMPOSE_FILE down -v 2>/dev/null || true
}

# Clean up on exit
trap cleanup EXIT

# Clean up any existing containers
cleanup

echo "[1/6] Setting environment variables..."
export NEXTAUTH_SECRET=$(openssl rand -base64 32)
export NEXTAUTH_URL="http://localhost:3000"
echo "  [OK] Environment configured"

echo ""
echo "[2/6] Building and starting services..."
docker compose -f $COMPOSE_FILE build || {
    echo "FAILED: Build failed"
    exit 1
}
docker compose -f $COMPOSE_FILE up -d || {
    echo "FAILED: Failed to start services"
    exit 1
}
echo "  [OK] Services started"

echo ""
echo "[3/6] Waiting for services to be healthy (max 180s)..."
MAX_RETRY=90
RETRY=0

# Wait for all services
while true; do
    RETRY=$((RETRY + 1))

    # Check if app container is healthy
    APP_STATUS=$(docker inspect --format='{{.State.Health.Status}}' ducsigr-app 2>/dev/null || echo "starting")

    if [ "$APP_STATUS" = "healthy" ]; then
        break
    fi

    if [ $RETRY -ge $MAX_RETRY ]; then
        echo "FAILED: Services not healthy after ${MAX_RETRY}x2 seconds"
        echo ""
        echo "Container statuses:"
        docker compose -f $COMPOSE_FILE ps
        echo ""
        echo "App logs:"
        docker compose -f $COMPOSE_FILE logs app | tail -50
        exit 1
    fi

    echo "  Waiting... ($RETRY/$MAX_RETRY) - App status: $APP_STATUS"
    sleep 2
done
echo "  [OK] All services healthy"

echo ""
echo "[4/6] Verifying health endpoint..."
HEALTH=$(curl -s http://localhost:3000/api/health)
STATUS=$(echo "$HEALTH" | jq -r '.status')

if [ "$STATUS" != "healthy" ] && [ "$STATUS" != "degraded" ]; then
    echo "FAILED: Health status is '$STATUS'"
    echo "$HEALTH" | jq
    exit 1
fi
echo "  [OK] Health status: $STATUS"
echo "$HEALTH" | jq '.services'

echo ""
echo "[5/6] Verifying ingest endpoint..."
INGEST_HEALTH=$(curl -s http://localhost:8080/health)
INGEST_STATUS=$(echo "$INGEST_HEALTH" | jq -r '.status')

if [ "$INGEST_STATUS" != "ok" ]; then
    echo "FAILED: Ingest status is '$INGEST_STATUS'"
    echo "$INGEST_HEALTH" | jq
    exit 1
fi
echo "  [OK] Ingest health: $INGEST_STATUS"

echo ""
echo "[6/6] Verifying container separation..."
CONTAINERS=$(docker compose -f $COMPOSE_FILE ps --format json | jq -r '.Name' | wc -l)
if [ $CONTAINERS -lt 4 ]; then
    echo "FAILED: Expected at least 4 containers, got $CONTAINERS"
    docker compose -f $COMPOSE_FILE ps
    exit 1
fi
echo "  [OK] $CONTAINERS containers running"
docker compose -f $COMPOSE_FILE ps --format "table {{.Name}}\t{{.Status}}"

echo ""
echo "=========================================="
echo "  All tests passed!"
echo "=========================================="
echo ""
echo "Services:"
echo "  Web:     http://localhost:3000"
echo "  Ingest:  http://localhost:8080"
echo "  Health:  http://localhost:3000/api/health"
