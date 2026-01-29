# Ducsigr SDK Engineering Specifications

## Executive Summary

This document outlines the engineering specifications for building and publishing the Ducsigr SDK, enabling seamless integration of AI/LLM application tracing with the Ducsigr observability platform.

## Table of Contents

1. [Goals & Requirements](#1-goals--requirements)
2. [Architecture Overview](#2-architecture-overview)
3. [SDK Design Principles](#3-sdk-design-principles)
4. [Core Components](#4-core-components)
5. [API Design](#5-api-design)
6. [Language-Specific Implementations](#6-language-specific-implementations)
7. [Publishing Strategy](#7-publishing-strategy)
8. [Testing Requirements](#8-testing-requirements)
9. [Documentation Requirements](#9-documentation-requirements)
10. [Implementation Roadmap](#10-implementation-roadmap)

---

## 1. Goals & Requirements

### 1.1 Primary Goals

| Goal | Description |
|------|-------------|
| **Seamless Integration** | < 5 minutes to first trace in production |
| **Zero Configuration** | Sensible defaults, optional customization |
| **Minimal Overhead** | < 1ms latency impact on traced operations |
| **Type Safety** | Full TypeScript/Python type hints support |
| **Framework Agnostic** | Works with any LLM provider or framework |

### 1.2 Functional Requirements

| Requirement | Priority | Description |
|-------------|----------|-------------|
| **Trace Creation** | P0 | Create traces with automatic ID generation |
| **Span Management** | P0 | Nested spans with parent-child relationships |
| **LLM Tracking** | P0 | Capture model, tokens, input/output, latency |
| **Auto-Instrumentation** | P1 | Automatic tracing for popular LLM libraries |
| **Manual Instrumentation** | P0 | Decorators/wrappers for custom code |
| **Batch Transmission** | P1 | Efficient batching of spans |
| **Offline Queue** | P2 | Queue spans when service unavailable |
| **Context Propagation** | P1 | Distributed tracing across services |

### 1.3 Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| **Latency Impact** | < 1ms per span creation |
| **Memory Overhead** | < 10MB for batch queue |
| **Bundle Size (JS)** | < 50KB minified + gzipped |
| **Package Size (Python)** | < 500KB installed |
| **Startup Time** | < 100ms initialization |

---

## 2. Architecture Overview

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Application                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────────┐     ┌──────────────────┐                     │
│   │  LLM Provider    │     │  Custom Code     │                     │
│   │  (OpenAI, etc.)  │     │  (Functions)     │                     │
│   └────────┬─────────┘     └────────┬─────────┘                     │
│            │                        │                                │
│            ▼                        ▼                                │
│   ┌─────────────────────────────────────────────┐                   │
│   │           Ducsigr SDK                       │                   │
│   │  ┌─────────────┐  ┌─────────────────────┐   │                   │
│   │  │   Tracer    │  │  Auto-Instrumentation│   │                   │
│   │  │             │  │  (OpenAI, Anthropic) │   │                   │
│   │  └──────┬──────┘  └──────────┬──────────┘   │                   │
│   │         │                    │               │                   │
│   │         ▼                    ▼               │                   │
│   │  ┌──────────────────────────────────────┐   │                   │
│   │  │         Span Processor               │   │                   │
│   │  │  (Batching, Sampling, Enrichment)    │   │                   │
│   │  └──────────────────┬───────────────────┘   │                   │
│   │                     │                        │                   │
│   │                     ▼                        │                   │
│   │  ┌──────────────────────────────────────┐   │                   │
│   │  │         Transport Layer              │   │                   │
│   │  │  (HTTP, Compression, Retry)          │   │                   │
│   │  └──────────────────┬───────────────────┘   │                   │
│   └─────────────────────┼───────────────────────┘                   │
│                         │                                            │
└─────────────────────────┼────────────────────────────────────────────┘
                          │
                          ▼ HTTPS + gzip
              ┌──────────────────────────┐
              │   Ducsigr Ingest API     │
              │   POST /v1/traces        │
              └──────────────────────────┘
```

### 2.2 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Ducsigr SDK                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    PUBLIC API LAYER                            │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │ │
│  │  │   Ducsigr    │  │    Trace     │  │        Span          │  │ │
│  │  │    Client    │  │   Context    │  │      Builder         │  │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                  INSTRUMENTATION LAYER                         │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │ │
│  │  │    OpenAI    │  │  Anthropic   │  │   LangChain/etc.     │  │ │
│  │  │   Wrapper    │  │   Wrapper    │  │     Callbacks        │  │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    PROCESSING LAYER                            │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │ │
│  │  │   Batcher    │  │   Sampler    │  │      Enricher        │  │ │
│  │  │              │  │              │  │  (Env, Host, etc.)   │  │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    TRANSPORT LAYER                             │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │ │
│  │  │    HTTP      │  │  Retry/      │  │     Offline          │  │ │
│  │  │   Client     │  │  Backoff     │  │      Queue           │  │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. SDK Design Principles

### 3.1 Core Principles

| Principle | Implementation |
|-----------|----------------|
| **Convention over Configuration** | Works out of the box with `DUCSIGR_API_KEY` env var |
| **Fail-Safe** | SDK errors never crash user application |
| **Non-Blocking** | All network I/O is async, non-blocking |
| **Observable** | SDK emits its own metrics and logs (optional) |
| **Extensible** | Plugin architecture for custom processors |

### 3.2 Error Handling Philosophy

```
User Code Errors   → Propagate normally (not our concern)
SDK Errors         → Log and continue (never throw)
Network Errors     → Retry with backoff, then queue locally
Auth Errors        → Log warning, disable sending (but keep collecting)
```

### 3.3 Thread Safety Model

- **Python**: Use `threading.Lock` for shared state, asyncio-compatible
- **JavaScript/Node**: Event loop single-threaded, no locks needed

---

## 4. Core Components

### 4.1 DucsigClient (Main Entry Point)

The primary interface for SDK initialization and configuration.

```typescript
interface DucsigClientConfig {
  // Required
  apiKey?: string;           // Falls back to DUCSIGR_API_KEY env var

  // Optional - Endpoint
  baseUrl?: string;          // Default: "https://ingest.ducsigr.io"

  // Optional - Resource Attributes
  serviceName?: string;      // Default: auto-detect from package.json/pyproject
  serviceVersion?: string;   // Default: auto-detect
  environment?: string;      // Default: DUCSIGR_ENVIRONMENT or "development"

  // Optional - Batching
  batchSize?: number;        // Default: 100 spans
  flushInterval?: number;    // Default: 5000ms
  maxQueueSize?: number;     // Default: 10000 spans

  // Optional - Behavior
  enabled?: boolean;         // Default: true (false in test environments)
  debug?: boolean;           // Default: false
  sampleRate?: number;       // Default: 1.0 (100%)

  // Optional - Transport
  timeout?: number;          // Default: 30000ms
  compression?: boolean;     // Default: true (gzip)
  retryConfig?: RetryConfig;
}

interface RetryConfig {
  maxRetries?: number;       // Default: 3
  initialDelay?: number;     // Default: 1000ms
  maxDelay?: number;         // Default: 30000ms
  backoffMultiplier?: number; // Default: 2
}
```

### 4.2 Trace Context

Manages the current trace context for automatic span parenting.

```typescript
interface TraceContext {
  traceId: string;           // 32-char hex
  spanId: string;            // 16-char hex (current span)
  parentSpanId?: string;     // 16-char hex (parent span)
  traceState?: string;       // W3C trace state
  metadata?: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
}
```

### 4.3 Span Builder

Fluent interface for creating spans with all supported attributes.

```typescript
interface SpanBuilder {
  // Core
  name(name: string): SpanBuilder;
  kind(kind: SpanKind): SpanBuilder;

  // Timing (optional - auto-tracked)
  startTime(time: Date): SpanBuilder;
  endTime(time: Date): SpanBuilder;

  // Hierarchy
  parentSpanId(id: string): SpanBuilder;

  // LLM-specific
  model(model: string): SpanBuilder;
  input(data: unknown): SpanBuilder;
  output(data: unknown): SpanBuilder;
  tokenUsage(usage: TokenUsage): SpanBuilder;
  modelParameters(params: Record<string, unknown>): SpanBuilder;

  // Status
  status(code: StatusCode, message?: string): SpanBuilder;
  error(error: Error): SpanBuilder;

  // Attributes
  setAttribute(key: string, value: AttributeValue): SpanBuilder;
  setAttributes(attrs: Record<string, AttributeValue>): SpanBuilder;

  // Metadata
  metadata(data: Record<string, unknown>): SpanBuilder;

  // Events
  addEvent(name: string, attributes?: Record<string, unknown>): SpanBuilder;

  // Finalize
  end(): void;
}

type SpanKind = "INTERNAL" | "SERVER" | "CLIENT" | "PRODUCER" | "CONSUMER";
type StatusCode = "UNSET" | "OK" | "ERROR";

interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}
```

### 4.4 Span Processor Pipeline

Configurable pipeline for span processing before transmission.

```typescript
interface SpanProcessor {
  onStart(span: Span, parentContext: TraceContext): void;
  onEnd(span: Span): void;
  shutdown(): Promise<void>;
  forceFlush(): Promise<void>;
}

// Built-in processors
class BatchSpanProcessor implements SpanProcessor { }
class SamplingSpanProcessor implements SpanProcessor { }
class EnrichmentProcessor implements SpanProcessor { }
class FilterProcessor implements SpanProcessor { }
```

### 4.5 Transport Layer

Handles HTTP communication with retry and compression.

```typescript
interface Transport {
  send(payload: IngestPayload): Promise<TransportResult>;
  shutdown(): Promise<void>;
}

interface TransportResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  retryAfter?: number;  // For 429 responses
}

interface IngestPayload {
  resourceSpans: ResourceSpans[];
}
```

---

## 5. API Design

### 5.1 Initialization

```typescript
// Minimal initialization (uses env vars)
import { Ducsigr } from "@ducsigr/sdk";

Ducsigr.init();

// Full configuration
Ducsigr.init({
  apiKey: "dsg_xxxx",
  serviceName: "my-llm-app",
  environment: "production",
  sampleRate: 0.5,
});
```

### 5.2 Manual Tracing API

```typescript
// Create a trace with automatic context propagation
const trace = Ducsigr.startTrace("chat-request", {
  userId: "user-123",
  sessionId: "session-456",
  metadata: { feature: "chatbot" },
});

// Create spans within the trace
const span = trace.startSpan("openai-completion")
  .model("gpt-4")
  .input({ messages: [...] })
  .end();

// Nested spans (automatic parenting via context)
const parentSpan = trace.startSpan("process-request");
const childSpan = trace.startSpan("validate-input");  // Auto-parented
childSpan.end();
parentSpan.end();

// End the trace
trace.end();
```

### 5.3 Decorator/Wrapper API

```typescript
// TypeScript/JavaScript decorator
import { trace, span } from "@ducsigr/sdk";

class ChatService {
  @trace("chat-request")
  async handleChat(message: string) {
    const response = await this.generateResponse(message);
    return response;
  }

  @span("generate-response")
  async generateResponse(message: string) {
    // Automatically creates span with timing
    return await openai.chat.completions.create({ ... });
  }
}

// Functional wrapper
const tracedFunction = Ducsigr.wrap("my-operation", async (input) => {
  return await processInput(input);
});
```

### 5.4 Auto-Instrumentation API

```typescript
// Enable auto-instrumentation for supported libraries
import { Ducsigr } from "@ducsigr/sdk";
import { OpenAIInstrumentation } from "@ducsigr/sdk/instrumentations";

Ducsigr.init({
  instrumentations: [
    new OpenAIInstrumentation({
      captureInput: true,   // Capture prompts
      captureOutput: true,  // Capture completions
    }),
  ],
});

// Or use the convenience method
Ducsigr.init();
Ducsigr.instrument("openai");  // Auto-patches OpenAI client
```

### 5.5 LLM-Specific Helpers

```typescript
// High-level LLM tracking
import { trackLLMCall } from "@ducsigr/sdk";

const result = await trackLLMCall({
  name: "generate-summary",
  model: "gpt-4",
  provider: "openai",
  input: messages,
  fn: async () => {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
    });
    return response;
  },
});

// Automatic token extraction from response
// SDK parses response.usage.prompt_tokens, etc.
```

### 5.6 Context Propagation

```typescript
// Get current context for distributed tracing
const context = Ducsigr.getCurrentContext();
// Returns: { traceId, spanId, traceState }

// Inject into HTTP headers
const headers = Ducsigr.inject({});
// Adds: traceparent, tracestate headers

// Extract from incoming request
Ducsigr.extract(request.headers);
// Restores context from traceparent header
```

---

## 6. Language-Specific Implementations

### 6.1 JavaScript/TypeScript SDK

**Package Structure:**
```
packages/
└── sdk-node/
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── index.ts              # Main exports
    │   ├── client.ts             # DucsigClient
    │   ├── tracer.ts             # Trace/Span management
    │   ├── context.ts            # Context propagation
    │   ├── transport.ts          # HTTP transport
    │   ├── processors/
    │   │   ├── batch.ts
    │   │   ├── sampling.ts
    │   │   └── enrichment.ts
    │   ├── instrumentations/
    │   │   ├── openai.ts
    │   │   ├── anthropic.ts
    │   │   └── langchain.ts
    │   └── utils/
    │       ├── id-generator.ts
    │       └── env.ts
    └── tests/
        └── ...
```

**Package.json:**
```json
{
  "name": "@ducsigr/sdk",
  "version": "0.1.0",
  "description": "Ducsigr SDK for AI/LLM observability",
  "main": "./dist/cjs/index.js",
  "module": "./dist/esm/index.js",
  "types": "./dist/types/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.js",
      "types": "./dist/types/index.d.ts"
    },
    "./instrumentations": {
      "import": "./dist/esm/instrumentations/index.js",
      "require": "./dist/cjs/instrumentations/index.js"
    }
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "peerDependencies": {
    "openai": ">=4.0.0",
    "@anthropic-ai/sdk": ">=0.10.0"
  },
  "peerDependenciesMeta": {
    "openai": { "optional": true },
    "@anthropic-ai/sdk": { "optional": true }
  }
}
```

### 6.2 Python SDK

**Package Structure:**
```
packages/
└── sdk-python/
    ├── pyproject.toml
    ├── src/
    │   └── ducsigr/
    │       ├── __init__.py
    │       ├── client.py
    │       ├── tracer.py
    │       ├── context.py
    │       ├── transport.py
    │       ├── processors/
    │       │   ├── __init__.py
    │       │   ├── batch.py
    │       │   └── sampling.py
    │       ├── instrumentations/
    │       │   ├── __init__.py
    │       │   ├── openai.py
    │       │   └── anthropic.py
    │       └── decorators.py
    └── tests/
        └── ...
```

**Python API Examples:**
```python
from ducsigr import Ducsigr, trace, span

# Initialize
Ducsigr.init(api_key="dsg_xxxx")

# Decorator-based tracing
@trace("chat-request")
async def handle_chat(message: str) -> str:
    response = await generate_response(message)
    return response

@span("generate-response")
async def generate_response(message: str) -> str:
    return await openai.chat.completions.create(...)

# Context manager
async with Ducsigr.start_trace("my-operation") as trace:
    async with trace.start_span("step-1") as span:
        span.set_attribute("key", "value")
        # ... do work
```

**pyproject.toml:**
```toml
[project]
name = "ducsigr"
version = "0.1.0"
description = "Ducsigr SDK for AI/LLM observability"
requires-python = ">=3.9"
dependencies = [
    "httpx>=0.25.0",
    "typing-extensions>=4.0.0",
]

[project.optional-dependencies]
openai = ["openai>=1.0.0"]
anthropic = ["anthropic>=0.10.0"]
all = ["openai>=1.0.0", "anthropic>=0.10.0"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

---

## 7. Publishing Strategy

### 7.1 Package Registry Configuration

| Language | Registry | Package Name | Scope |
|----------|----------|--------------|-------|
| JavaScript/TypeScript | npm | `@ducsigr/sdk` | `@ducsigr` org |
| Python | PyPI | `ducsigr` | N/A |

### 7.2 npm Publishing Setup

```yaml
# .github/workflows/publish-sdk-node.yml
name: Publish Node SDK

on:
  push:
    tags:
      - 'sdk-node-v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write  # For npm provenance
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm --filter @ducsigr/sdk build

      - name: Test
        run: pnpm --filter @ducsigr/sdk test

      - name: Publish
        run: pnpm --filter @ducsigr/sdk publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### 7.3 PyPI Publishing Setup

```yaml
# .github/workflows/publish-sdk-python.yml
name: Publish Python SDK

on:
  push:
    tags:
      - 'sdk-python-v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write  # For PyPI trusted publishing
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install build tools
        run: pip install build twine

      - name: Build
        working-directory: packages/sdk-python
        run: python -m build

      - name: Publish to PyPI
        uses: pypa/gh-action-pypi-publish@release/v1
        with:
          packages-dir: packages/sdk-python/dist/
```

### 7.4 Version Management

**Versioning Strategy:** Semantic Versioning (SemVer)

| Version Component | When to Increment |
|-------------------|-------------------|
| **Major** (1.x.x) | Breaking API changes |
| **Minor** (x.1.x) | New features, backwards compatible |
| **Patch** (x.x.1) | Bug fixes, backwards compatible |

**Pre-release Tags:**
- `0.1.0-alpha.1` - Early development
- `0.1.0-beta.1` - Feature complete, testing
- `0.1.0-rc.1` - Release candidate

**Changelog Requirements:**
- Maintain `CHANGELOG.md` in each SDK package
- Follow [Keep a Changelog](https://keepachangelog.com) format
- Auto-generate from conventional commits

### 7.5 Release Process

```bash
# 1. Create release branch
git checkout -b release/sdk-node-v0.1.0

# 2. Update version in package.json
pnpm --filter @ducsigr/sdk version 0.1.0

# 3. Update CHANGELOG.md
# Add release notes under ## [0.1.0] - YYYY-MM-DD

# 4. Commit and tag
git add .
git commit -m "chore(sdk): release @ducsigr/sdk v0.1.0"
git tag sdk-node-v0.1.0

# 5. Push (triggers CI/CD)
git push origin release/sdk-node-v0.1.0 --tags

# 6. Create PR for version bump
gh pr create --title "Release @ducsigr/sdk v0.1.0"
```

---

## 8. Testing Requirements

### 8.1 Test Categories

| Category | Coverage Target | Purpose |
|----------|-----------------|---------|
| **Unit Tests** | > 80% | Individual component testing |
| **Integration Tests** | Key flows | SDK ↔ Ingest API |
| **E2E Tests** | Critical paths | Full trace lifecycle |
| **Performance Tests** | Benchmarks | Latency, memory, throughput |

### 8.2 Unit Test Requirements

```typescript
// Example: Transport layer tests
describe("HttpTransport", () => {
  it("should send payload with correct headers", async () => {
    const transport = new HttpTransport({ apiKey: "test-key" });
    const payload = createTestPayload();

    const result = await transport.send(payload);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Authorization": "Bearer test-key",
          "Content-Type": "application/json",
          "Content-Encoding": "gzip",
        }),
      })
    );
  });

  it("should retry on 429 with backoff", async () => {
    mockFetch
      .mockResolvedValueOnce({ status: 429, headers: { "Retry-After": "2" } })
      .mockResolvedValueOnce({ status: 200, ok: true });

    const result = await transport.send(payload);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should not throw on network error", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const result = await transport.send(payload);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network error");
  });
});
```

### 8.3 Integration Test Setup

```typescript
// tests/integration/ingest.test.ts
describe("SDK ↔ Ingest Integration", () => {
  let ingestServer: TestServer;

  beforeAll(async () => {
    // Start local ingest server
    ingestServer = await startTestIngestServer();
  });

  afterAll(async () => {
    await ingestServer.close();
  });

  it("should successfully ingest a trace with spans", async () => {
    Ducsigr.init({
      apiKey: TEST_API_KEY,
      baseUrl: ingestServer.url,
    });

    const trace = Ducsigr.startTrace("test-trace");
    const span = trace.startSpan("test-span")
      .model("gpt-4")
      .tokenUsage({ promptTokens: 100, completionTokens: 50 })
      .end();
    trace.end();

    await Ducsigr.flush();

    // Verify in database
    const storedTrace = await db.trace.findFirst({
      where: { externalTraceId: trace.traceId },
    });
    expect(storedTrace).toBeDefined();
    expect(storedTrace.spanCount).toBe(1);
  });
});
```

### 8.4 Performance Benchmarks

```typescript
// benchmarks/span-creation.bench.ts
import { bench, describe } from "vitest";

describe("Span Creation Performance", () => {
  bench("create simple span", () => {
    const span = tracer.startSpan("test");
    span.end();
  });

  bench("create span with attributes", () => {
    const span = tracer.startSpan("test")
      .model("gpt-4")
      .tokenUsage({ promptTokens: 100, completionTokens: 50 })
      .setAttributes({ key1: "value1", key2: 123 })
      .end();
  });
});

// Expected results:
// - Simple span: < 0.5ms
// - Span with attributes: < 1ms
```

### 8.5 Test Commands

```bash
# Run all tests
pnpm --filter @ducsigr/sdk test

# Run with coverage
pnpm --filter @ducsigr/sdk test:coverage

# Run integration tests
pnpm --filter @ducsigr/sdk test:integration

# Run benchmarks
pnpm --filter @ducsigr/sdk bench
```

---

## 9. Documentation Requirements

### 9.1 Documentation Structure

```
docs/
└── sdk/
    ├── README.md              # Quick start
    ├── getting-started.md     # Installation & setup
    ├── configuration.md       # All config options
    ├── tracing.md             # Manual tracing guide
    ├── auto-instrumentation.md # Auto-instrumentation
    ├── api-reference.md       # Full API docs
    ├── examples/
    │   ├── openai.md
    │   ├── anthropic.md
    │   ├── langchain.md
    │   └── fastapi.md
    └── troubleshooting.md
```

### 9.2 README Template

```markdown
# Ducsigr SDK

The official SDK for [Ducsigr](https://ducsigr.io) - AI/LLM Observability Platform.

## Quick Start

### Installation

```bash
npm install @ducsigr/sdk
# or
pip install ducsigr
```

### Basic Usage

```typescript
import { Ducsigr } from "@ducsigr/sdk";

// Initialize with your API key
Ducsigr.init({ apiKey: "dsg_xxxx" });

// Or use environment variable
// DUCSIGR_API_KEY=dsg_xxxx

// Trace an LLM call
const response = await Ducsigr.trackLLMCall({
  name: "chat-completion",
  model: "gpt-4",
  fn: async () => {
    return await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello!" }],
    });
  },
});
```

## Features

- Automatic tracing for OpenAI, Anthropic, LangChain
- Token usage and cost tracking
- Distributed tracing support
- < 1ms overhead per span

## Documentation

[Full Documentation](https://docs.ducsigr.io/sdk)

## License

MIT
```

### 9.3 API Reference Requirements

- Full TypeDoc/Sphinx documentation for all public APIs
- Code examples for every method
- Type definitions included
- Common use cases documented

---

## 10. Implementation Roadmap

### Phase 1: Core SDK (v0.1.0)

| Task | Priority | Status |
|------|----------|--------|
| Project setup (monorepo, build, CI) | P0 | Pending |
| Core client initialization | P0 | Pending |
| Manual trace/span API | P0 | Pending |
| HTTP transport with retry | P0 | Pending |
| Batch processor | P0 | Pending |
| ID generation utilities | P0 | Pending |
| Basic tests | P0 | Pending |
| npm publish workflow | P0 | Pending |

### Phase 2: Auto-Instrumentation (v0.2.0)

| Task | Priority | Status |
|------|----------|--------|
| OpenAI instrumentation | P1 | Pending |
| Anthropic instrumentation | P1 | Pending |
| LangChain callback handler | P2 | Pending |
| Decorator/wrapper APIs | P1 | Pending |

### Phase 3: Python SDK (v0.3.0)

| Task | Priority | Status |
|------|----------|--------|
| Python core client | P1 | Pending |
| Python decorators | P1 | Pending |
| Python auto-instrumentation | P1 | Pending |
| PyPI publish workflow | P1 | Pending |

### Phase 4: Advanced Features (v1.0.0)

| Task | Priority | Status |
|------|----------|--------|
| Sampling strategies | P2 | Pending |
| Offline queue | P2 | Pending |
| Context propagation (W3C) | P2 | Pending |
| Custom processors API | P2 | Pending |
| Performance optimizations | P2 | Pending |

---

## Appendix A: OTLP Payload Format

Reference format for ingest API requests:

```json
{
  "resourceSpans": [
    {
      "resource": {
        "attributes": [
          { "key": "service.name", "value": { "stringValue": "my-app" } },
          { "key": "service.version", "value": { "stringValue": "1.0.0" } },
          { "key": "deployment.environment", "value": { "stringValue": "production" } }
        ]
      },
      "scopeSpans": [
        {
          "scope": {
            "name": "@ducsigr/sdk",
            "version": "0.1.0"
          },
          "spans": [
            {
              "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
              "spanId": "00f067aa0ba902b7",
              "parentSpanId": "",
              "name": "chat.completions",
              "kind": 3,
              "startTimeUnixNano": "1704067200000000000",
              "endTimeUnixNano": "1704067201500000000",
              "attributes": [
                { "key": "gen_ai.request.model", "value": { "stringValue": "gpt-4" } },
                { "key": "gen_ai.usage.input_tokens", "value": { "intValue": "150" } },
                { "key": "gen_ai.usage.output_tokens", "value": { "intValue": "50" } },
                { "key": "gen_ai.prompt", "value": { "stringValue": "Hello, how are you?" } },
                { "key": "gen_ai.completion", "value": { "stringValue": "I'm doing well, thank you!" } }
              ],
              "status": { "code": 1, "message": "" }
            }
          ]
        }
      ]
    }
  ]
}
```

## Appendix B: Error Codes

| Code | HTTP Status | Description | SDK Handling |
|------|-------------|-------------|--------------|
| `MISSING_API_KEY` | 401 | No API key provided | Log error, disable sending |
| `INVALID_API_KEY` | 401 | API key not found | Log error, disable sending |
| `EXPIRED_API_KEY` | 401 | API key expired | Log error, disable sending |
| `VALIDATION_FAILED` | 400 | Payload validation error | Log warning, drop payload |
| `PAYLOAD_TOO_LARGE` | 413 | Exceeds size limit | Split batch, retry |
| `TOO_MANY_SPANS` | 400 | Exceeds span limit | Split batch, retry |
| `RATE_LIMITED` | 429 | Rate limit exceeded | Backoff, retry |
| `SERVER_ERROR` | 500 | Internal server error | Retry with backoff |

## Appendix C: Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DUCSIGR_API_KEY` | Yes* | - | API key for authentication |
| `DUCSIGR_BASE_URL` | No | `https://ingest.ducsigr.io` | Ingest endpoint URL |
| `DUCSIGR_ENVIRONMENT` | No | `development` | Deployment environment |
| `DUCSIGR_SERVICE_NAME` | No | Auto-detect | Service name for traces |
| `DUCSIGR_ENABLED` | No | `true` | Enable/disable SDK |
| `DUCSIGR_DEBUG` | No | `false` | Enable debug logging |
| `DUCSIGR_SAMPLE_RATE` | No | `1.0` | Trace sampling rate (0.0-1.0) |

*Required unless passed via `init()` config.
