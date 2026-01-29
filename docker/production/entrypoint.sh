#!/bin/sh
# docker/production/entrypoint.sh
#
# Ducsigr Production Entrypoint
# Infrastructure is external (Docker Compose), just validate and start

set -e

echo "================================================================"
echo "  Ducsigr Production                                        "
echo "================================================================"

# ============================================================
# 1. Validate Required Environment Variables
# ============================================================
echo "[1/4] Validating configuration..."

if [ -z "$NEXTAUTH_SECRET" ]; then
    echo "ERROR: NEXTAUTH_SECRET is required"
    echo "Generate with: openssl rand -base64 32"
    exit 1
fi

if [ ${#NEXTAUTH_SECRET} -lt 32 ]; then
    echo "ERROR: NEXTAUTH_SECRET must be at least 32 characters"
    exit 1
fi

if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL is required"
    exit 1
fi

echo "  [OK] Configuration valid"

# ============================================================
# 2. Generate Internal Secrets (if not provided)
# ============================================================
echo "[2/4] Checking internal secrets..."

SECRETS_FILE="/app/secrets/.env"

if [ -z "$INTERNAL_API_SECRET" ] || [ -z "$JWT_SHARED_SECRET" ]; then
    if [ -f "$SECRETS_FILE" ]; then
        echo "  -> Loading existing secrets..."
        set -a
        . "$SECRETS_FILE"
        set +a
    else
        echo "  -> Generating internal secrets..."
        mkdir -p /app/secrets

        export INTERNAL_API_SECRET=$(openssl rand -hex 32)
        export JWT_SHARED_SECRET=$(openssl rand -hex 32)

        cat > "$SECRETS_FILE" << EOF
INTERNAL_API_SECRET=$INTERNAL_API_SECRET
JWT_SHARED_SECRET=$JWT_SHARED_SECRET
EOF
        echo "  [OK] Secrets generated"
    fi
else
    echo "  [OK] Using provided secrets"
fi

# ============================================================
# 3. Wait for Dependencies
# ============================================================
echo "[3/4] Waiting for dependencies..."

# Extract host and port from DATABASE_URL
# Format: postgresql://user:pass@host:port/database
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:/]*\).*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_PORT=${DB_PORT:-5432}

echo "  -> Waiting for PostgreSQL ($DB_HOST:$DB_PORT)..."
MAX_RETRIES=30
RETRY=0
until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
    RETRY=$((RETRY + 1))
    if [ $RETRY -ge $MAX_RETRIES ]; then
        echo "ERROR: PostgreSQL not available after $MAX_RETRIES attempts"
        exit 1
    fi
    echo "     Attempt $RETRY/$MAX_RETRIES..."
    sleep 2
done
echo "  [OK] PostgreSQL ready"

# Wait for Temporal if configured
if [ -n "$TEMPORAL_ADDRESS" ]; then
    TEMPORAL_HOST=$(echo "$TEMPORAL_ADDRESS" | cut -d: -f1)
    TEMPORAL_PORT=$(echo "$TEMPORAL_ADDRESS" | cut -d: -f2)
    TEMPORAL_PORT=${TEMPORAL_PORT:-7233}

    echo "  -> Waiting for Temporal ($TEMPORAL_HOST:$TEMPORAL_PORT)..."
    RETRY=0
    until nc -z "$TEMPORAL_HOST" "$TEMPORAL_PORT" 2>/dev/null; do
        RETRY=$((RETRY + 1))
        if [ $RETRY -ge $MAX_RETRIES ]; then
            echo "ERROR: Temporal not available after $MAX_RETRIES attempts"
            exit 1
        fi
        echo "     Attempt $RETRY/$MAX_RETRIES..."
        sleep 2
    done
    echo "  [OK] Temporal ready"
fi

# ============================================================
# 4. Run Migrations
# ============================================================
echo "[4/4] Running migrations..."

cd /app/packages/db
npx prisma migrate deploy --schema=./prisma/schema.prisma 2>/dev/null || npx prisma db push --schema=./prisma/schema.prisma --accept-data-loss
cd /app

echo "  [OK] Migrations complete"

# ============================================================
# Start Application
# ============================================================
echo ""
echo "================================================================"
echo "  Starting Ducsigr services...                              "
echo ""
echo "  Web:    http://localhost:3000                                 "
echo "  Ingest: http://localhost:8080                                 "
echo "  Health: http://localhost:3000/api/health                      "
echo "================================================================"
echo ""

exec /usr/bin/supervisord -c /etc/supervisord.conf
