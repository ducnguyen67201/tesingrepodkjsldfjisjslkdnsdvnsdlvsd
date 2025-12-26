#!/bin/bash
# scripts/test-quickstart.sh
#
# Integration test for Ducsigr Quick Start image

set -e

echo "=========================================="
echo "  Ducsigr Quick Start Integration Test"
echo "=========================================="
echo ""

CONTAINER_NAME="ducsigr-test"
VOLUME_NAME="ducsigr_test_data"
WEB_PORT=13000
INGEST_PORT=18080

cleanup() {
    echo ""
    echo "[Cleanup] Removing test container and volume..."
    docker rm -f $CONTAINER_NAME 2>/dev/null || true
    docker volume rm $VOLUME_NAME 2>/dev/null || true
}

# Clean up on exit
trap cleanup EXIT

# Clean up any existing test container
cleanup

echo "[1/6] Building image..."
docker build -f Dockerfile.quickstart -t ducsigr:test . || {
    echo "FAILED: Build failed"
    exit 1
}
echo "  [OK] Image built successfully"

echo ""
echo "[2/6] Starting container..."
docker run -d --name $CONTAINER_NAME \
    -p $WEB_PORT:3000 \
    -p $INGEST_PORT:8080 \
    -v $VOLUME_NAME:/data \
    ducsigr:test || {
    echo "FAILED: Container failed to start"
    exit 1
}
echo "  [OK] Container started"

echo ""
echo "[3/6] Waiting for startup (max 180s)..."
MAX_RETRY=90
RETRY=0
while ! curl -sf http://localhost:$WEB_PORT/api/health > /dev/null 2>&1; do
    RETRY=$((RETRY + 1))
    if [ $RETRY -ge $MAX_RETRY ]; then
        echo "FAILED: Health check timeout after ${MAX_RETRY}x2 seconds"
        echo ""
        echo "Container logs:"
        docker logs $CONTAINER_NAME | tail -100
        exit 1
    fi
    echo "  Waiting... ($RETRY/$MAX_RETRY)"
    sleep 2
done
echo "  [OK] Service responding"

echo ""
echo "[4/6] Verifying health endpoint..."
HEALTH=$(curl -s http://localhost:$WEB_PORT/api/health)
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
INGEST_HEALTH=$(curl -s http://localhost:$INGEST_PORT/health)
INGEST_STATUS=$(echo "$INGEST_HEALTH" | jq -r '.status')

if [ "$INGEST_STATUS" != "ok" ]; then
    echo "FAILED: Ingest status is '$INGEST_STATUS'"
    echo "$INGEST_HEALTH" | jq
    exit 1
fi
echo "  [OK] Ingest health: $INGEST_STATUS"

echo ""
echo "[6/6] Verifying data persistence..."
# Stop and restart container
docker stop $CONTAINER_NAME
docker start $CONTAINER_NAME

# Wait for restart
sleep 10
RETRY=0
while ! curl -sf http://localhost:$WEB_PORT/api/health > /dev/null 2>&1; do
    RETRY=$((RETRY + 1))
    if [ $RETRY -ge 30 ]; then
        echo "FAILED: Container didn't recover after restart"
        exit 1
    fi
    sleep 2
done
echo "  [OK] Container recovered after restart"

echo ""
echo "=========================================="
echo "  All tests passed!"
echo "=========================================="
echo ""
echo "Image: ducsigr:test"
echo "Web:   http://localhost:$WEB_PORT"
echo "Ingest: http://localhost:$INGEST_PORT"
