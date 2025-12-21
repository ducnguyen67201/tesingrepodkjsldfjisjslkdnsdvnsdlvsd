# Quickstart

Get CognObserve running in under 5 minutes.

## Prerequisites

- Node.js 24+
- pnpm 9+ (`npm install -g pnpm`)
- Docker

## Setup

```bash
# 1. Start infrastructure (PostgreSQL, Redis, Temporal)
docker-compose up -d

# 2. Install dependencies
pnpm install

# 3. Setup environment & database
cp .env.example .env
pnpm db:generate
pnpm db:push
pnpm db:seed
```

## Run

You need 2 terminals:

```bash
# Terminal 1 - Web + Worker
pnpm dev

# Terminal 2 - Ingest API
make dev-ingest
```

Or with Doppler for secrets:

```bash
# Install Doppler
doppler login
doppler setup

# Terminal 1 - Web App + Worker
doppler run -c dev -- pnpm dev

# Terminal 2 - Ingest API
doppler run -c dev -- make dev-ingest
```

## Access

| Service      | URL                          | Description                    |
| ------------ | ---------------------------- | ------------------------------ |
| Dashboard    | http://localhost:3000        | Web application                |
| Temporal UI  | http://localhost:8088        | Workflow monitoring & debugging|
| Ingest API   | http://localhost:8080        | OTLP trace ingestion endpoint  |
| Health Check | http://localhost:8080/health | Ingest service health          |
| Metrics      | http://localhost:8080/metrics| Prometheus metrics             |

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────┐
│ Ingest-Node  │────▶│  Temporal Server │◀────│   Worker    │
│  (port 8080) │     │  (port 7233)     │     │  (Node.js)  │
└──────────────┘     └──────────────────┘     └─────────────┘
       │                     │                       │
       │                     │                       │ tRPC
       ▼                     ▼                       ▼
┌────────────────────────────────────────────────────────┐
│                    PostgreSQL                          │
│                    (port 5432)                         │
└────────────────────────────────────────────────────────┘
```

## Test It

```bash
# 1. Create a project in the dashboard and get an API key

# 2. Send a test OTLP trace
curl -X POST http://localhost:8080/v1/traces \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [
          {"key": "service.name", "value": {"stringValue": "test-service"}}
        ]
      },
      "scopeSpans": [{
        "spans": [{
          "traceId": "a1b2c3d4e5f6789012345678901234ab",
          "spanId": "a1b2c3d4e5f67890",
          "name": "llm-call",
          "startTimeUnixNano": "1704067200000000000",
          "endTimeUnixNano": "1704067201000000000"
        }]
      }]
    }]
  }'

# 3. Check Temporal UI at http://localhost:8088 to see the workflow
```

## Troubleshooting

| Issue                   | Fix                                                     |
| ----------------------- | ------------------------------------------------------- |
| Traces not appearing    | Check worker terminal for errors                        |
| Temporal not connecting | Run `docker-compose ps` to verify temporal is running   |
| Costs showing $0        | Run `pnpm db:seed` to add model pricing                 |
| Connection refused      | Run `docker-compose ps` to verify databases are running |
| Workflow not starting   | Check Temporal UI at http://localhost:8088 for errors   |
