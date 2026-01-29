# Ingest Demo App

A simple demo application that demonstrates OpenTelemetry (OTLP) integration with Ducsigr's ingest service.

## Features

- **OpenTelemetry Auto-Instrumentation**: Automatically captures HTTP and Express spans
- **Manual Span Creation**: Shows how to create custom spans with attributes
- **External API Calls**: Demonstrates distributed tracing across services
- **Mock LLM Route**: Simulates LLM calls with token usage tracking
- **Simple Web UI**: Click-driven interface for generating traces

## Prerequisites

- Node.js 20+
- Ducsigr ingest service running (default: http://localhost:8080)
- API key from your Ducsigr project (optional for local development)

## Quick Start

### 1. Install Dependencies

From the repository root:

```bash
pnpm install
```

### 2. Start the Ingest Service

In a separate terminal:

```bash
make dev-ingest
```

### 3. Start the Demo App

```bash
# From repository root
pnpm --filter @ducsigr/ingest-demo dev

# Or from apps/ingest-demo
cd apps/ingest-demo
pnpm dev
```

### 4. Open the UI

Navigate to http://localhost:3005 and click the buttons to generate traces.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3005` | Demo app server port |
| `DUCSIGR_ENDPOINT` | `http://localhost:8080` | Ingest service URL |
| `DUCSIGR_API_KEY` | - | API key for authentication |
| `OTEL_SERVICE_NAME` | `ingest-demo` | Service name for traces |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/demo/weather` | POST | Fetch weather data (wttr.in) |
| `/api/demo/quotes` | POST | Get random quote (zenquotes.io) |
| `/api/demo/jokes` | POST | Get dad joke (icanhazdadjoke.com) |
| `/api/demo/llm` | POST | Mock LLM call with token usage |

## Example Requests

### Weather

```bash
curl -X POST http://localhost:3005/api/demo/weather \
  -H "Content-Type: application/json" \
  -d '{"city": "Tokyo"}'
```

### Mock LLM

```bash
curl -X POST http://localhost:3005/api/demo/llm \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Explain observability", "model": "gpt-4-mock", "maxTokens": 100}'
```

## Trace Structure

### Weather Route
```
weather.fetch
├── [auto] HTTP GET wttr.in
└── (attributes: city, temp_c, humidity)
```

### Quotes Route
```
quotes.fetch
├── quotes.api_call
│   └── [auto] HTTP GET zenquotes.io
└── quotes.process
    └── (attributes: word_count, author)
```

### Mock LLM Route
```
llm.generate
├── llm.tokenize
├── llm.infer
└── llm.detokenize
    └── (attributes: prompt_tokens, completion_tokens, total_tokens)
```

## Verifying Traces

### Check Ingest Logs

Watch the ingest service logs for incoming traces:

```bash
# Look for POST /v1/traces requests
```

### Check Database

Traces should appear in the `traces` and `spans` tables:

```sql
SELECT * FROM "Trace" ORDER BY "createdAt" DESC LIMIT 5;
SELECT * FROM "Span" ORDER BY "startTime" DESC LIMIT 10;
```

### Check Dashboard

Navigate to your Ducsigr dashboard to see the traces in the UI.

## Troubleshooting

### No traces appearing

1. Ensure ingest service is running on port 8080
2. Check `DUCSIGR_ENDPOINT` environment variable
3. Verify API key is correct (if authentication is enabled)
4. Check ingest service logs for errors

### Connection refused

The ingest service may not be running. Start it with:

```bash
make dev-ingest
```

### Authentication errors

If you see 401 errors, set your API key:

```bash
export DUCSIGR_API_KEY=your-api-key-here
pnpm --filter @ducsigr/ingest-demo dev
```

## Development

### Build

```bash
pnpm --filter @ducsigr/ingest-demo build
```

### Run Production Build

```bash
pnpm --filter @ducsigr/ingest-demo start
```

### Type Check

```bash
pnpm --filter @ducsigr/ingest-demo typecheck
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Ingest Demo App                             │
│                       (http://localhost:3005)                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────────────────────────────────────┐│
│  │   Static    │    │              OpenTelemetry SDK              ││
│  │    UI       │    │  • Auto-instrumentation (HTTP, Express)    ││
│  │  (public/)  │    │  • Manual spans with attributes            ││
│  └─────────────┘    │  • OTLP HTTP Exporter                      ││
│                     └─────────────────────────────────────────────┘│
│                                      │                              │
│  ┌─────────────────────────────────────────────────────────────────┤
│  │                      Express Routes                             │
│  ├──────────────┬──────────────┬──────────────┬───────────────────│
│  │   /weather   │   /quotes    │   /jokes     │     /llm          │
│  │  (wttr.in)   │ (zenquotes)  │ (dadjokes)   │   (mock)          │
│  └──────────────┴──────────────┴──────────────┴───────────────────│
└────────────────────────────────────┼────────────────────────────────┘
                                     │
                                     ▼ OTLP/HTTP
┌─────────────────────────────────────────────────────────────────────┐
│                     Ducsigr Ingest Service                      │
│                       (http://localhost:8080)                       │
│                                                                     │
│                         POST /v1/traces                             │
└─────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           PostgreSQL                                │
│                                                                     │
│                    Trace, Span tables                               │
└─────────────────────────────────────────────────────────────────────┘
```
