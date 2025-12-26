#!/bin/bash
# docker/quickstart/entrypoint.sh
#
# Ducsigr Quick Start Entrypoint
# Handles: First-run setup, secret generation, database init, migrations

set -e

echo "========================================================"
echo "                                                        "
echo "   ██████╗ ██████╗  ██████╗ ███╗   ██╗                 "
echo "  ██╔════╝██╔═══██╗██╔════╝ ████╗  ██║                 "
echo "  ██║     ██║   ██║██║  ███╗██╔██╗ ██║                 "
echo "  ██║     ██║   ██║██║   ██║██║╚██╗██║                 "
echo "  ╚██████╗╚██████╔╝╚██████╔╝██║ ╚████║                 "
echo "   ╚═════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝                 "
echo "                                                        "
echo "            Ducsigr Quick Start                     "
echo "                                                        "
echo "========================================================"
echo ""

FIRST_RUN=false
SECRETS_FILE="/data/secrets/.env"
INIT_MARKER="/data/.initialized"

# ============================================================
# 1. Check if this is first run
# ============================================================
if [ ! -f "$INIT_MARKER" ]; then
    FIRST_RUN=true
    echo "[1/5] First run detected - initializing..."
else
    echo "[1/5] Existing installation detected"
fi

# ============================================================
# 2. Generate secrets (first run only)
# ============================================================
echo "[2/5] Checking secrets..."

if [ ! -f "$SECRETS_FILE" ]; then
    echo "  -> Generating secrets..."
    mkdir -p /data/secrets

    NEXTAUTH_SECRET=$(openssl rand -hex 32)
    INTERNAL_API_SECRET=$(openssl rand -hex 32)
    JWT_SHARED_SECRET=$(openssl rand -hex 32)
    POSTGRES_PASSWORD=$(openssl rand -hex 16)

    cat > "$SECRETS_FILE" << EOF
# Ducsigr Auto-Generated Secrets
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# WARNING: Do not edit unless you know what you're doing

NEXTAUTH_SECRET=$NEXTAUTH_SECRET
NEXTAUTH_URL=${NEXTAUTH_URL:-http://localhost:3000}
INTERNAL_API_SECRET=$INTERNAL_API_SECRET
JWT_SHARED_SECRET=$JWT_SHARED_SECRET
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
DATABASE_URL=postgresql://ducsigr:$POSTGRES_PASSWORD@localhost:5432/ducsigr
REDIS_URL=redis://localhost:6379
TEMPORAL_ADDRESS=${TEMPORAL_ADDRESS:-localhost:7233}
TEMPORAL_NAMESPACE=${TEMPORAL_NAMESPACE:-default}
TEMPORAL_TASK_QUEUE=${TEMPORAL_TASK_QUEUE:-ducsigr-tasks}
WEB_API_URL=http://localhost:3000
EOF

    echo "  -> Secrets generated and saved to /data/secrets/.env"
else
    echo "  -> Using existing secrets"
fi

# Load secrets into environment
set -a
source "$SECRETS_FILE"
set +a

# ============================================================
# 3. Initialize PostgreSQL (first run only)
# ============================================================
echo "[3/5] Checking PostgreSQL..."

if [ ! -d "/data/postgresql/base" ]; then
    echo "  -> Initializing PostgreSQL database..."

    # Initialize PostgreSQL
    su postgres -c "initdb -D /data/postgresql"

    # Configure PostgreSQL
    cat >> /data/postgresql/postgresql.conf << EOF
listen_addresses = 'localhost'
port = 5432
max_connections = 100
shared_buffers = 128MB
EOF

    cat >> /data/postgresql/pg_hba.conf << EOF
local   all             all                                     trust
host    all             all             127.0.0.1/32            md5
host    all             all             ::1/128                 md5
EOF

    # Start PostgreSQL temporarily to create database
    su postgres -c "pg_ctl -D /data/postgresql -l /tmp/postgres.log start"
    sleep 3

    # Create user and database
    su postgres -c "psql -c \"CREATE USER ducsigr WITH PASSWORD '$POSTGRES_PASSWORD';\""
    su postgres -c "psql -c \"CREATE DATABASE ducsigr OWNER ducsigr;\""
    su postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE ducsigr TO ducsigr;\""

    # Stop PostgreSQL (supervisor will start it)
    su postgres -c "pg_ctl -D /data/postgresql stop"

    echo "  -> PostgreSQL initialized"
else
    echo "  -> PostgreSQL already initialized"
fi

# ============================================================
# 4. Initialize Redis data directory
# ============================================================
echo "[4/5] Checking Redis..."

if [ ! -d "/data/redis" ]; then
    mkdir -p /data/redis
    chown redis:redis /data/redis
    echo "  -> Redis data directory created"
else
    echo "  -> Redis data directory exists"
fi

# ============================================================
# 5. Start supervisor and run migrations
# ============================================================
echo "[5/5] Starting services..."

# Start supervisor in background
/usr/bin/supervisord -c /etc/supervisord.conf &
SUPERVISOR_PID=$!

# Wait for PostgreSQL to be ready
echo "  -> Waiting for PostgreSQL..."
MAX_RETRIES=30
RETRY=0
until pg_isready -h localhost -p 5432 -U ducsigr -q 2>/dev/null; do
    RETRY=$((RETRY + 1))
    if [ $RETRY -ge $MAX_RETRIES ]; then
        echo "ERROR: PostgreSQL failed to start"
        exit 1
    fi
    sleep 2
done
echo "  -> PostgreSQL ready"

# Wait for Redis to be ready
echo "  -> Waiting for Redis..."
RETRY=0
until redis-cli ping 2>/dev/null | grep -q PONG; do
    RETRY=$((RETRY + 1))
    if [ $RETRY -ge $MAX_RETRIES ]; then
        echo "ERROR: Redis failed to start"
        exit 1
    fi
    sleep 1
done
echo "  -> Redis ready"

# Wait for Temporal to be ready
echo "  -> Waiting for Temporal..."
RETRY=0
until nc -z localhost 7233 2>/dev/null; do
    RETRY=$((RETRY + 1))
    if [ $RETRY -ge $MAX_RETRIES ]; then
        echo "WARNING: Temporal not available, ingest service may fail to start"
        break
    fi
    sleep 2
done
if nc -z localhost 7233 2>/dev/null; then
    echo "  -> Temporal ready"
fi

# Run migrations
echo "  -> Running database migrations..."
cd /app/packages/db
# Use db push for simplicity in quickstart (creates tables if not exist)
# Use globally installed prisma CLI (avoids pnpm ESM issues)
prisma db push --schema=./prisma/schema.prisma --accept-data-loss 2>&1 || {
    echo "  -> Migration with db push failed, trying migrate deploy..."
    prisma migrate deploy --schema=./prisma/schema.prisma 2>&1 || echo "  -> Migration warning (database may need manual setup)"
}
cd /app
echo "  -> Migrations complete"

# Ingest service is autostarted by supervisor
echo "  -> Ingest service starting..."

# Mark as initialized
touch "$INIT_MARKER"

# ============================================================
# Ready!
# ============================================================
echo ""
echo "========================================================"
echo "                                                        "
echo "   Ducsigr is ready!                                "
echo "                                                        "
echo "   Dashboard:    http://localhost:3000                  "
echo "   Ingest API:   http://localhost:8080                  "
echo "   Health Check: http://localhost:8080/health           "
echo "                                                        "
echo "   Your secrets are stored in the Docker volume at:     "
echo "   /data/secrets/.env                                   "
echo "                                                        "
echo "   NOTE: Worker not included. For alerts/background      "
echo "   jobs, run the worker separately.                     "
echo "                                                        "
echo "========================================================"
echo ""

# Keep container running (wait for supervisor)
wait $SUPERVISOR_PID
