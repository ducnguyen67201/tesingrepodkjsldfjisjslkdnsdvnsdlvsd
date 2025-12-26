# Self-Hosting Ducsigr

Ducsigr can be self-hosted with two deployment options:

1. **Quick Start** - Single container, zero configuration
2. **Production** - Docker Compose with separate services

---

## Quick Start (Recommended for Evaluation)

Get Ducsigr running locally in under 2 minutes.

### Prerequisites

- Docker 24+ installed
- 4GB RAM minimum (8GB recommended)
- 10GB disk space

### Step 1: Build the Docker Image

```bash
# Clone the repository
git clone https://github.com/ducsigr/ducsigr.git
cd ducsigr

# Build the quickstart image
docker build -f Dockerfile.quickstart -t ducsigr:quickstart .
```

> **Note:** The build takes 5-10 minutes on first run.

### Step 2: Run Ducsigr

```bash
docker run -d --name ducsigr \
  -p 3000:3000 \
  -p 8080:8080 \
  -v ducsigr_data:/data \
  ducsigr:quickstart
```

### Step 3: Wait for Startup

The container needs about 60 seconds to initialize:
- Generate secrets
- Initialize PostgreSQL
- Run database migrations
- Start all services

Check the logs:

```bash
docker logs -f ducsigr
```

You'll see this when ready:

```
========================================================

   Ducsigr is ready!

   Dashboard:    http://localhost:3000
   Ingest API:   http://localhost:8080
   Health Check: http://localhost:8080/health

========================================================
```

### Step 4: Access the Dashboard

Open http://localhost:3000 in your browser.

1. Create an account (first user becomes admin)
2. Create a workspace
3. Create a project
4. Copy your API key from project settings

### What's Included

| Service | Port | Description |
|---------|------|-------------|
| Web Dashboard | 3000 | Next.js web interface & API |
| Ingest API | 8080 | High-performance trace ingestion (Go) |
| PostgreSQL | 5432 (internal) | Database |
| Redis | 6379 (internal) | Cache |
| Temporal | 7233 (internal) | Workflow orchestration |

> **Note:** The Worker service is NOT included in quickstart. Traces are queued in Temporal but alerts and background processing require running the worker separately. See [Running the Worker](#running-the-worker-optional) below.

### Optional Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXTAUTH_URL` | `http://localhost:3000` | Public URL of the dashboard |

Example with custom URL:

```bash
docker run -d --name ducsigr \
  -p 3000:3000 \
  -p 8080:8080 \
  -v ducsigr_data:/data \
  -e NEXTAUTH_URL="https://observe.example.com" \
  ducsigr:quickstart
```

---

## Sending Your First Trace

### Using cURL

```bash
curl -X POST http://localhost:8080/v1/traces \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "X-Project-ID: YOUR_PROJECT_ID" \
  -d '{
    "id": "test-trace-001",
    "name": "hello-world",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "spans": [
      {
        "id": "span-001",
        "name": "llm-call",
        "type": "LLM",
        "startTime": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
        "endTime": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
        "model": "gpt-4",
        "input": "Hello, world!",
        "output": "Hi there!",
        "tokenUsage": {
          "promptTokens": 10,
          "completionTokens": 5,
          "totalTokens": 15
        }
      }
    ]
  }'
```

### Using Python SDK

```python
from ducsigr import Ducsigr

client = Ducsigr(
    api_key="YOUR_API_KEY",
    project_id="YOUR_PROJECT_ID",
    host="http://localhost:8080"
)

with client.trace("my-trace") as trace:
    with trace.span("llm-call", type="LLM") as span:
        span.set_model("gpt-4")
        span.set_input("Hello!")
        # ... your LLM call
        span.set_output("Response")
```

---

## Running the Worker (Optional)

The worker processes background jobs like:
- Alert evaluation and notifications
- Cost calculations
- Data aggregations

To enable these features, run the worker separately:

```bash
# In development mode
cd apps/worker
pnpm dev

# Or build and run
pnpm build
node dist/index.js
```

The worker connects to the same PostgreSQL, Redis, and Temporal services.

---

## Verifying Installation

### Check Container Health

```bash
docker inspect ducsigr --format='{{.State.Health.Status}}'
# Expected: healthy
```

### Check Ingest Service

```bash
curl http://localhost:8080/health
# Expected: {"status":"ok","version":"0.1.0"}
```

### Check Services Status

```bash
docker exec ducsigr supervisorctl status
```

Expected output:

```
infrastructure:postgresql         RUNNING
infrastructure:redis              RUNNING
infrastructure:temporal           RUNNING
application:ingest                RUNNING
application:web                   RUNNING
```

---

## Data Persistence

All data is stored in the `/data` volume:

| Path | Content |
|------|---------|
| `/data/postgresql/` | PostgreSQL data |
| `/data/redis/` | Redis persistence |
| `/data/temporal/` | Temporal database |
| `/data/secrets/.env` | Auto-generated secrets |

Your data persists across container restarts as long as you use the same volume.

---

## Upgrading

```bash
# Stop and remove container (keeps data)
docker stop ducsigr && docker rm ducsigr

# Pull latest code and rebuild
git pull
docker build -f Dockerfile.quickstart -t ducsigr:quickstart .

# Restart with same volume
docker run -d --name ducsigr \
  -p 3000:3000 \
  -p 8080:8080 \
  -v ducsigr_data:/data \
  ducsigr:quickstart
```

---

## Backup & Restore

### Backup

```bash
# Stop container
docker stop ducsigr

# Backup the entire data volume
docker run --rm \
  -v ducsigr_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/ducsigr-backup-$(date +%Y%m%d).tar.gz /data

# Restart
docker start ducsigr
```

### Restore

```bash
# Stop and remove container
docker stop ducsigr && docker rm ducsigr

# Remove old volume
docker volume rm ducsigr_data

# Create new volume and restore
docker volume create ducsigr_data
docker run --rm \
  -v ducsigr_data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/ducsigr-backup-YYYYMMDD.tar.gz -C /

# Start container
docker run -d --name ducsigr \
  -p 3000:3000 \
  -p 8080:8080 \
  -v ducsigr_data:/data \
  ducsigr:quickstart
```

---

## Troubleshooting

### Container won't start

Check logs for errors:

```bash
docker logs ducsigr
```

Common issues:
- Port 3000 or 8080 already in use
- Not enough memory (need 4GB+)
- Volume permission issues

### Services not starting

Check individual service status:

```bash
docker exec ducsigr supervisorctl status
```

Restart a specific service:

```bash
docker exec ducsigr supervisorctl restart application:web
```

### Database connection issues

Check PostgreSQL is running:

```bash
docker exec ducsigr pg_isready -h localhost -U ducsigr
```

### View generated secrets

```bash
docker exec ducsigr cat /data/secrets/.env
```

### Reset everything

```bash
# Remove container and all data
docker stop ducsigr && docker rm ducsigr
docker volume rm ducsigr_data

# Start fresh
docker run -d --name ducsigr \
  -p 3000:3000 \
  -p 8080:8080 \
  -v ducsigr_data:/data \
  ducsigr:quickstart
```

---

## Architecture

### Quick Start (Single Container)

```
┌─────────────────────────────────────────────────────────┐
│              ducsigr:quickstart                     │
│  ┌─────────────────────────────────────────────────┐   │
│  │               supervisord                        │   │
│  └─────────────────────────────────────────────────┘   │
│       │        │        │        │        │            │
│  ┌────▼───┐ ┌──▼──┐ ┌───▼───┐ ┌──▼───┐ ┌──▼───┐      │
│  │Postgres│ │Redis│ │Temporal│ │ Web  │ │Ingest│      │
│  │ :5432  │ │:6379│ │ :7233  │ │:3000 │ │:8080 │      │
│  └────────┘ └─────┘ └────────┘ └──────┘ └──────┘      │
│                                                         │
│  Volume: /data                                         │
│  ├── postgresql/   (database)                          │
│  ├── redis/        (cache)                             │
│  ├── temporal/     (workflows)                         │
│  └── secrets/      (auto-generated)                    │
└─────────────────────────────────────────────────────────┘

Exposed Ports:
  :3000 → Web Dashboard & API
  :8080 → Ingest API (for SDKs)
```

---

## Production Setup

For production deployments with separate services, horizontal scaling, and high availability, see `docker-compose.self-hosted.yml`.

---

## Support

- GitHub Issues: https://github.com/ducsigr/ducsigr/issues
