# Ingest Demo App - Engineering Specification

**Status:** Draft
**Owner:** Ingest + SDK Team
**Last Updated:** 2024-12-20
**Version:** 1.0

---

## 1. Executive Summary

This specification defines a simple Node.js demo application that demonstrates Ducsigr's observability capabilities. The app makes real HTTP API calls, integrates with OpenTelemetry (OTLP) for automatic instrumentation, and uses the `@ducsigr/sdk` to send traces to the ingest service.

### Goals

1. **Demonstrate Real Data Flow** - Show traces from external API calls (weather, quotes, jokes APIs)
2. **OpenTelemetry Integration** - Native OTLP instrumentation with auto-propagation
3. **Ducsigr SDK Usage** - Manual tracing with `@ducsigr/sdk` for LLM-style spans
4. **End-to-End Visibility** - Traces flow: Demo App → Ingest Service → PostgreSQL → Web Dashboard

### Non-Goals

- Production-grade error handling or auth
- Database or state persistence in the demo app
- Complex UI (simple HTML page with buttons)
- gRPC ingestion (HTTP/JSON only)

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DEMO APP ARCHITECTURE                          │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────────────────────────────────┐
                    │              Demo App (Port 3005)            │
                    │  ┌────────────────────────────────────────┐  │
                    │  │           Express Server               │  │
                    │  │                                        │  │
                    │  │  ┌──────────┐  ┌──────────┐            │  │
                    │  │  │ OTLP     │  │ CognObs  │            │  │
                    │  │  │ Auto     │  │ SDK      │            │  │
                    │  │  │ Instrum. │  │ Manual   │            │  │
                    │  │  └────┬─────┘  └────┬─────┘            │  │
                    │  │       │             │                  │  │
                    │  └───────┼─────────────┼──────────────────┘  │
                    └──────────┼─────────────┼─────────────────────┘
                               │             │
                               ▼             ▼
                    ┌──────────────────────────────────────────────┐
                    │            Ingest Service (Port 8080)        │
                    │                                              │
                    │  POST /v1/traces                             │
                    │  - Content-Type: application/json            │
                    │  - Authorization: Bearer <API_KEY>           │
                    │                                              │
                    │  Pipeline:                                   │
                    │  Parse → Normalize → Validate → Auth →       │
                    │  Scrub → Persist → Response                  │
                    │                                              │
                    └──────────────────────┬───────────────────────┘
                                           │
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │              PostgreSQL (Port 5432)          │
                    │                                              │
                    │  Tables: Trace, Span, Project, ApiKey        │
                    │                                              │
                    └──────────────────────┬───────────────────────┘
                                           │
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │              Web Dashboard (Port 3000)       │
                    │                                              │
                    │  View traces, spans, metrics, costs          │
                    │                                              │
                    └──────────────────────────────────────────────┘
```

---

## 3. Data Flow

### 3.1 Trace Flow Sequence

```
┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐
│  Browser  │     │ Demo App  │     │ External  │     │  Ingest   │     │ PostgreSQL│
│           │     │           │     │   API     │     │  Service  │     │           │
└─────┬─────┘     └─────┬─────┘     └─────┬─────┘     └─────┬─────┘     └─────┬─────┘
      │                 │                 │                 │                 │
      │  Click Button   │                 │                 │                 │
      │────────────────>│                 │                 │                 │
      │                 │                 │                 │                 │
      │                 │  Start Trace    │                 │                 │
      │                 │────┐            │                 │                 │
      │                 │    │            │                 │                 │
      │                 │<───┘            │                 │                 │
      │                 │                 │                 │                 │
      │                 │  HTTP GET       │                 │                 │
      │                 │────────────────>│                 │                 │
      │                 │                 │                 │                 │
      │                 │  JSON Response  │                 │                 │
      │                 │<────────────────│                 │                 │
      │                 │                 │                 │                 │
      │                 │  End Trace      │                 │                 │
      │                 │────┐            │                 │                 │
      │                 │    │            │                 │                 │
      │                 │<───┘            │                 │                 │
      │                 │                 │                 │                 │
      │                 │  POST /v1/traces│                 │                 │
      │                 │────────────────────────────────-->│                 │
      │                 │                 │                 │                 │
      │                 │                 │                 │  INSERT Trace   │
      │                 │                 │                 │────────────────>│
      │                 │                 │                 │                 │
      │                 │                 │                 │  INSERT Spans   │
      │                 │                 │                 │────────────────>│
      │                 │                 │                 │                 │
      │                 │  {trace_id, success: true}        │                 │
      │                 │<──────────────────────────────────│                 │
      │                 │                 │                 │                 │
      │  JSON Response  │                 │                 │                 │
      │<────────────────│                 │                 │                 │
```

### 3.2 Ingest Pipeline Stages

| Stage | Handler | Description |
|-------|---------|-------------|
| 1 | `ParseHandler` | Decompress gzip, parse JSON/protobuf OTLP |
| 2 | `NormalizeHandler` | Convert OTLP → internal format, extract GenAI fields |
| 3 | `ValidateHandler` | Validate span count, payload size limits |
| 4 | `AuthHandler` | Validate API key, extract project ID |
| 5 | `ScrubHandler` | Redact sensitive data (optional) |
| 6 | `PersistHandler` | Insert traces/spans to PostgreSQL |
| 7 | `ResponseHandler` | Return trace_id, span_ids, success |

---

## 4. Technical Specification

### 4.1 Project Structure

```
apps/ingest-demo/
├── src/
│   ├── index.ts              # Express server + OTLP setup
│   ├── config.ts             # Environment configuration
│   ├── telemetry.ts          # OpenTelemetry initialization
│   ├── routes/
│   │   ├── index.ts          # Route aggregator
│   │   ├── weather.ts        # Weather API demo
│   │   ├── quotes.ts         # Quotes API demo
│   │   ├── jokes.ts          # Jokes API demo
│   │   └── llm-mock.ts       # Mock LLM call demo
│   └── lib/
│       ├── http-client.ts    # Instrumented fetch wrapper
│       └── trace-helpers.ts  # SDK trace utilities
├── public/
│   └── index.html            # Simple UI with buttons
├── package.json
├── tsconfig.json
└── README.md
```

### 4.2 Dependencies

```json
{
  "name": "@ducsigr/ingest-demo",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "@ducsigr/sdk": "workspace:*",
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/auto-instrumentations-node": "^0.50.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.53.0",
    "@opentelemetry/sdk-node": "^0.53.0",
    "@opentelemetry/semantic-conventions": "^1.27.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

### 4.3 Environment Variables

```bash
# Required
DUCSIGR_API_KEY=co_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional (defaults shown)
DUCSIGR_ENDPOINT=http://localhost:8080
PORT=3005
OTEL_SERVICE_NAME=ingest-demo
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:8080
NODE_ENV=development
```

---

## 5. Implementation Details

### 5.1 OpenTelemetry Setup (`src/telemetry.ts`)

```typescript
/**
 * OpenTelemetry Instrumentation Setup
 *
 * Initializes OTLP tracing with auto-instrumentation for:
 * - HTTP client calls (fetch, http.request)
 * - Express middleware and routes
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION
} from '@opentelemetry/semantic-conventions';

import { config } from './config.js';

const resource = new Resource({
  [ATTR_SERVICE_NAME]: config.serviceName,
  [ATTR_SERVICE_VERSION]: '1.0.0',
  'deployment.environment': config.environment,
});

const traceExporter = new OTLPTraceExporter({
  url: `${config.ducsigrEndpoint}/v1/traces`,
  headers: {
    'Authorization': `Bearer ${config.apiKey}`,
  },
});

export const sdk = new NodeSDK({
  resource,
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Only instrument what we need
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-express': { enabled: true },
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
    }),
  ],
});

export function initTelemetry(): void {
  sdk.start();
  console.log('[Telemetry] OpenTelemetry initialized');

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('[Telemetry] Shutdown complete'))
      .catch(console.error)
      .finally(() => process.exit(0));
  });
}
```

### 5.2 Ducsigr SDK Usage (`src/routes/llm-mock.ts`)

```typescript
/**
 * Mock LLM Route - Demonstrates manual SDK tracing
 *
 * Simulates an LLM call with proper span attributes:
 * - Model name and parameters
 * - Token usage (prompt, completion, total)
 * - Input/output capture
 */
import { Router } from 'express';
import { Ducsigr } from '@ducsigr/sdk';

export const llmRouter = Router();

llmRouter.post('/mock-llm', async (req, res) => {
  const { prompt = 'Hello, how are you?' } = req.body;

  // Create a trace for the LLM operation
  const trace = Ducsigr.startTrace({
    name: 'llm.chat.completion',
    metadata: {
      source: 'ingest-demo',
      endpoint: '/api/llm/mock-llm',
    },
  });

  try {
    // Span 1: Prepare request
    const prepSpan = trace.startSpan({ name: 'prepare-prompt' });
    prepSpan.setInput({ rawPrompt: prompt });

    const systemPrompt = 'You are a helpful assistant.';
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];

    prepSpan.setOutput({ messages });
    prepSpan.end();

    // Span 2: LLM API call (simulated)
    const llmSpan = trace.startSpan({
      name: 'openai.chat.completions.create',
      parentSpanId: prepSpan.id,
    });

    llmSpan.setModel('gpt-4o-mini', {
      temperature: 0.7,
      max_tokens: 150,
      top_p: 1,
    });

    llmSpan.setInput({ messages });

    // Simulate LLM latency
    await sleep(randomBetween(200, 500));

    const completion = generateMockCompletion(prompt);

    llmSpan.setOutput({
      id: `chatcmpl-${generateId()}`,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: completion },
        finish_reason: 'stop',
      }],
    });

    llmSpan.setUsage({
      promptTokens: countTokens(systemPrompt + prompt),
      completionTokens: countTokens(completion),
      totalTokens: countTokens(systemPrompt + prompt + completion),
    });

    llmSpan.end();

    // End trace and flush
    trace.end();
    await Ducsigr.flush();

    res.json({
      success: true,
      traceId: trace.id,
      response: completion,
      usage: {
        promptTokens: countTokens(systemPrompt + prompt),
        completionTokens: countTokens(completion),
      },
    });

  } catch (error) {
    trace.end();
    await Ducsigr.flush();

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Helpers
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function countTokens(text: string): number {
  // Rough approximation: ~4 chars per token
  return Math.ceil(text.length / 4);
}

function generateMockCompletion(prompt: string): string {
  const responses = [
    "I'm doing great, thank you for asking! How can I help you today?",
    "Hello! I'm here to assist you with any questions you might have.",
    "Thanks for reaching out! What would you like to know?",
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}
```

### 5.3 External API Route (`src/routes/weather.ts`)

```typescript
/**
 * Weather Route - Demonstrates OTLP auto-instrumentation
 *
 * Uses native fetch to call an external weather API.
 * OTLP automatically captures:
 * - HTTP method, URL, status code
 * - Request/response timing
 * - Span hierarchy
 */
import { Router } from 'express';
import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';

export const weatherRouter = Router();

const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';

weatherRouter.get('/weather', async (req, res) => {
  const { latitude = 40.7128, longitude = -74.006 } = req.query;

  const tracer = trace.getTracer('ingest-demo');

  // Create a parent span for the entire operation
  await tracer.startActiveSpan('weather.fetch',
    { kind: SpanKind.SERVER },
    async (span) => {
      try {
        span.setAttribute('weather.latitude', Number(latitude));
        span.setAttribute('weather.longitude', Number(longitude));

        const url = new URL(WEATHER_API);
        url.searchParams.set('latitude', String(latitude));
        url.searchParams.set('longitude', String(longitude));
        url.searchParams.set('current_weather', 'true');

        // This fetch is auto-instrumented by OTLP
        const response = await fetch(url.toString());

        if (!response.ok) {
          throw new Error(`Weather API returned ${response.status}`);
        }

        const data = await response.json();

        span.setAttribute('weather.temperature', data.current_weather?.temperature);
        span.setAttribute('weather.windspeed', data.current_weather?.windspeed);
        span.setStatus({ code: SpanStatusCode.OK });

        res.json({
          success: true,
          traceId: span.spanContext().traceId,
          data: {
            location: { latitude, longitude },
            temperature: data.current_weather?.temperature,
            windspeed: data.current_weather?.windspeed,
            unit: 'celsius',
          },
        });

      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        });

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        span.end();
      }
    }
  );
});
```

### 5.4 Main Server (`src/index.ts`)

```typescript
/**
 * Ingest Demo Server
 *
 * Simple Express server demonstrating Ducsigr tracing
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// MUST be first - initializes OTLP before any other imports
import { initTelemetry } from './telemetry.js';
initTelemetry();

import { Ducsigr } from '@ducsigr/sdk';
import { config } from './config.js';
import { weatherRouter } from './routes/weather.js';
import { quotesRouter } from './routes/quotes.js';
import { jokesRouter } from './routes/jokes.js';
import { llmRouter } from './routes/llm-mock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Ducsigr SDK
Ducsigr.init({
  apiKey: config.apiKey,
  endpoint: config.ducsigrEndpoint,
  debug: config.environment === 'development',
});

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ingest-demo' });
});

// Demo routes
app.use('/api/weather', weatherRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/jokes', jokesRouter);
app.use('/api/llm', llmRouter);

// Start server
app.listen(config.port, () => {
  console.log(`[Server] Ingest Demo running on http://localhost:${config.port}`);
  console.log(`[Server] Sending traces to ${config.ducsigrEndpoint}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[Server] Shutting down...');
  await Ducsigr.flush();
  await Ducsigr.shutdown();
  process.exit(0);
});
```

### 5.5 Simple UI (`public/index.html`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ducsigr Ingest Demo</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      background: #0a0a0a;
      color: #fafafa;
    }
    h1 { color: #facc15; }
    .card {
      background: #171717;
      border: 1px solid #262626;
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    .card h2 { margin-top: 0; color: #facc15; }
    button {
      background: #facc15;
      color: #0a0a0a;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      margin-right: 0.5rem;
      margin-bottom: 0.5rem;
    }
    button:hover { background: #fde047; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .result {
      background: #262626;
      border-radius: 4px;
      padding: 1rem;
      margin-top: 1rem;
      font-family: monospace;
      white-space: pre-wrap;
      font-size: 0.875rem;
      max-height: 300px;
      overflow-y: auto;
    }
    .success { border-left: 4px solid #22c55e; }
    .error { border-left: 4px solid #ef4444; }
    .trace-id { color: #facc15; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Ducsigr Ingest Demo</h1>
  <p>Click buttons to generate traces that are sent to the ingest service.</p>

  <div class="card">
    <h2>External API Calls (OTLP Auto-Instrumented)</h2>
    <p>These routes use native fetch with OpenTelemetry auto-instrumentation.</p>
    <button onclick="callApi('/api/weather/weather?latitude=40.7128&longitude=-74.006')">
      Get Weather (NYC)
    </button>
    <button onclick="callApi('/api/quotes/random')">
      Get Random Quote
    </button>
    <button onclick="callApi('/api/jokes/random')">
      Get Random Joke
    </button>
  </div>

  <div class="card">
    <h2>LLM Mock (SDK Manual Tracing)</h2>
    <p>Simulates an LLM call with token usage tracking via @ducsigr/sdk.</p>
    <button onclick="callLLM()">Call Mock LLM</button>
  </div>

  <div class="card">
    <h2>Result</h2>
    <div id="result" class="result">Click a button to see results...</div>
  </div>

  <script>
    async function callApi(endpoint) {
      const resultDiv = document.getElementById('result');
      resultDiv.textContent = 'Loading...';
      resultDiv.className = 'result';

      try {
        const response = await fetch(endpoint);
        const data = await response.json();

        resultDiv.className = `result ${data.success ? 'success' : 'error'}`;
        resultDiv.innerHTML = formatResult(data);
      } catch (error) {
        resultDiv.className = 'result error';
        resultDiv.textContent = `Error: ${error.message}`;
      }
    }

    async function callLLM() {
      const resultDiv = document.getElementById('result');
      resultDiv.textContent = 'Calling LLM...';
      resultDiv.className = 'result';

      try {
        const response = await fetch('/api/llm/mock-llm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'Tell me a fun fact about programming.' }),
        });
        const data = await response.json();

        resultDiv.className = `result ${data.success ? 'success' : 'error'}`;
        resultDiv.innerHTML = formatResult(data);
      } catch (error) {
        resultDiv.className = 'result error';
        resultDiv.textContent = `Error: ${error.message}`;
      }
    }

    function formatResult(data) {
      const traceId = data.traceId
        ? `<span class="trace-id">Trace ID: ${data.traceId}</span>\n\n`
        : '';
      return traceId + JSON.stringify(data, null, 2);
    }
  </script>
</body>
</html>
```

---

## 6. Trace Format Reference

### 6.1 SDK Trace (JSON sent to `/v1/traces`)

```json
{
  "trace_id": "tr_abc123xyz",
  "name": "llm.chat.completion",
  "session_id": null,
  "user_id": null,
  "metadata": {
    "source": "ingest-demo",
    "endpoint": "/api/llm/mock-llm"
  },
  "spans": [
    {
      "span_id": "sp_001",
      "parent_span_id": null,
      "name": "prepare-prompt",
      "start_time": "2024-12-20T10:30:00.000Z",
      "end_time": "2024-12-20T10:30:00.005Z",
      "input": { "rawPrompt": "Tell me a fun fact" },
      "output": { "messages": [...] },
      "level": "DEFAULT"
    },
    {
      "span_id": "sp_002",
      "parent_span_id": "sp_001",
      "name": "openai.chat.completions.create",
      "start_time": "2024-12-20T10:30:00.006Z",
      "end_time": "2024-12-20T10:30:00.350Z",
      "model": "gpt-4o-mini",
      "model_parameters": {
        "temperature": 0.7,
        "max_tokens": 150
      },
      "input": { "messages": [...] },
      "output": { "choices": [...] },
      "usage": {
        "prompt_tokens": 45,
        "completion_tokens": 32,
        "total_tokens": 77
      },
      "level": "DEFAULT"
    }
  ]
}
```

### 6.2 OTLP Trace (Auto-Instrumented)

```json
{
  "resourceSpans": [{
    "resource": {
      "attributes": [
        { "key": "service.name", "value": { "stringValue": "ingest-demo" } },
        { "key": "service.version", "value": { "stringValue": "1.0.0" } },
        { "key": "deployment.environment", "value": { "stringValue": "development" } }
      ]
    },
    "scopeSpans": [{
      "scope": { "name": "@opentelemetry/instrumentation-http" },
      "spans": [{
        "traceId": "abc123...",
        "spanId": "def456...",
        "name": "GET",
        "kind": 3,
        "startTimeUnixNano": "1703067000000000000",
        "endTimeUnixNano": "1703067000350000000",
        "attributes": [
          { "key": "http.method", "value": { "stringValue": "GET" } },
          { "key": "http.url", "value": { "stringValue": "https://api.open-meteo.com/v1/forecast" } },
          { "key": "http.status_code", "value": { "intValue": "200" } }
        ],
        "status": { "code": 1 }
      }]
    }]
  }]
}
```

---

## 7. Running the Demo

### 7.1 Prerequisites

```bash
# Start infrastructure (from repo root)
make docker-up

# Start ingest service (terminal 1)
make dev-ingest

# Start web dashboard (terminal 2)
pnpm dev
```

### 7.2 Start Demo App

```bash
# Navigate to demo app
cd apps/ingest-demo

# Install dependencies
pnpm install

# Set environment variables
export DUCSIGR_API_KEY=co_your_api_key_here
export DUCSIGR_ENDPOINT=http://localhost:8080

# Start in development mode
pnpm dev
```

### 7.3 Test Traces

1. Open `http://localhost:3005` in browser
2. Click any button (Weather, Quote, Joke, Mock LLM)
3. Observe trace ID in response
4. View traces in dashboard at `http://localhost:3000`

---

## 8. Validation Checklist

| Check | Description |
|-------|-------------|
| [ ] | Demo app starts on port 3005 |
| [ ] | Health endpoint returns 200 |
| [ ] | Weather button returns weather data + trace ID |
| [ ] | Quote button returns quote + trace ID |
| [ ] | Joke button returns joke + trace ID |
| [ ] | Mock LLM returns completion + token usage |
| [ ] | Ingest service logs show received traces |
| [ ] | PostgreSQL contains new Trace/Span records |
| [ ] | Web dashboard displays traces |

---

## 9. Error Scenarios

| Scenario | Expected Behavior |
|----------|-------------------|
| Missing API key | SDK logs warning, traces not sent |
| Invalid API key | Ingest returns 401, demo shows error |
| Ingest service down | SDK retries 3x, then fails silently |
| External API timeout | OTLP captures error span, demo returns 500 |
| Malformed JSON | Ingest returns 400, demo shows error |

---

## 10. Future Enhancements

1. **Real LLM Integration** - Add OpenAI/Anthropic wrappers for real LLM calls
2. **User Tracking** - Demonstrate `setUser()` for end-user identification
3. **Session Tracking** - Show multi-turn conversation flows
4. **Error Toggle** - Add `?fail=true` query param for testing error paths
5. **Metrics Dashboard** - Show token usage, latency percentiles

---

## 11. Related Documentation

- [Ducsigr SDK Documentation](../../../packages/sdk/README.md)
- [Ingest Service Spec](./168_INGEST_NODE_POSTGRES_SPEC.md)
- [OTLP Proto Definitions](../../../proto/ducsigr/v1/)
- [Quickstart Guide](../../QUICKSTART.md)
