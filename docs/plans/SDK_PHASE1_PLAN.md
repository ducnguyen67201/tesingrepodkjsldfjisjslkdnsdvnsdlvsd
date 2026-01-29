# SDK Phase 1 Implementation Plan

## Overview

This plan details the implementation of Phase 1 (v0.1.0) for the Ducsigr Node.js SDK, focusing on completing and enhancing the existing SDK foundation.

**Reference Issue:** #236 - [Epic] Ducsigr SDK - Complete Implementation (Node.js + Python)

---

## Current State Analysis

### Already Implemented ✅

| Component | Status | Location |
|-----------|--------|----------|
| Package structure | ✅ Complete | `packages/sdk/` |
| Build system (tsup) | ✅ Complete | `packages/sdk/tsconfig.json`, `tsup.config.ts` |
| DucsigClient singleton | ✅ Complete | `src/ducsigr.ts` |
| Trace class | ✅ Complete | `src/trace.ts` |
| Span class | ✅ Complete | `src/span.ts` |
| Transport (HTTP) | ✅ Basic | `src/transport.ts` |
| Config resolution | ✅ Complete | `src/config.ts` |
| Context propagation | ✅ Complete | `src/context.ts` (AsyncLocalStorage) |
| ID generation | ✅ Complete | `src/utils/id.ts` |
| OpenAI integration | ✅ Complete | `src/integrations/openai.ts` |
| Anthropic integration | ✅ Complete | `src/integrations/anthropic.ts` |
| Basic tests | ✅ Partial | `tests/*.test.ts` |
| CI workflow | ✅ Complete | `.github/workflows/sdk.yml` |

### Gaps to Address 🔧

| Component | Gap | Priority |
|-----------|-----|----------|
| Transport - gzip compression | Not implemented | P0 |
| Transport - Retry-After header handling | Not implemented | P0 |
| Transport - Rate limit (429) proper handling | Basic retry only | P0 |
| Batch processor - Max queue size | Not enforced | P1 |
| Batch processor - Queue overflow protection | Not implemented | P1 |
| Test coverage | ~60% estimated | P0 |
| npm publish workflow | Not implemented | P0 |
| OTLP format | Using custom format, not standard OTLP | P1 |
| Fluent SpanBuilder | Direct setters, no fluent chain | P2 |

---

## Implementation Plan

```json
{
  "feature": "SDK Phase 1 Completion",
  "summary": "Complete the Node.js SDK with gzip compression, proper retry logic, batch processor improvements, tests, and npm publishing",

  "tasks": [
    {
      "id": "1",
      "name": "Transport Layer Enhancements",
      "file": "packages/sdk/src/transport.ts",
      "changes": [
        "Add gzip compression using zlib",
        "Add Content-Encoding: gzip header",
        "Handle 429 Retry-After header",
        "Differentiate retry behavior: retry 429/5xx, don't retry 4xx",
        "Add circuit breaker after N consecutive failures"
      ]
    },
    {
      "id": "2",
      "name": "Batch Processor Improvements",
      "file": "packages/sdk/src/transport.ts",
      "changes": [
        "Add maxQueueSize config option",
        "Implement queue overflow protection (drop oldest)",
        "Log warning when dropping spans",
        "Add metrics/debug logging for queue depth"
      ]
    },
    {
      "id": "3",
      "name": "Config Enhancements",
      "file": "packages/sdk/src/config.ts",
      "changes": [
        "Add compression config option (default: true)",
        "Add maxQueueSize config option (default: 10000)",
        "Add sampleRate config option (default: 1.0)",
        "Add timeout config option (default: 30000)"
      ]
    },
    {
      "id": "4",
      "name": "Unit Tests - Transport",
      "file": "packages/sdk/tests/transport.test.ts",
      "testCases": [
        "should send payload with correct headers",
        "should compress payload with gzip when enabled",
        "should not compress when compression disabled",
        "should retry on 429 with Retry-After",
        "should retry on 5xx with exponential backoff",
        "should NOT retry on 4xx (except 429)",
        "should not throw on network error",
        "should respect timeout",
        "should include auth header"
      ]
    },
    {
      "id": "5",
      "name": "Unit Tests - Batch Processor",
      "file": "packages/sdk/tests/batch.test.ts",
      "testCases": [
        "should batch spans until batchSize reached",
        "should flush on interval",
        "should flush on manual flush()",
        "should drop oldest when queue exceeds maxQueueSize",
        "should log warning when dropping spans",
        "should flush on shutdown"
      ]
    },
    {
      "id": "6",
      "name": "Unit Tests - Complete Coverage",
      "files": [
        "packages/sdk/tests/config.test.ts",
        "packages/sdk/tests/span.test.ts",
        "packages/sdk/tests/context.test.ts",
        "packages/sdk/tests/id.test.ts"
      ],
      "targetCoverage": ">80%"
    },
    {
      "id": "7",
      "name": "npm Publish Workflow",
      "file": ".github/workflows/publish-sdk.yml",
      "changes": [
        "Trigger on sdk-v* tags",
        "Run tests before publish",
        "Build package",
        "Publish with --provenance",
        "Use NPM_TOKEN secret"
      ]
    },
    {
      "id": "8",
      "name": "Package Metadata",
      "file": "packages/sdk/package.json",
      "changes": [
        "Verify publishConfig.access: public",
        "Add homepage, bugs, repository fields",
        "Add keywords for discoverability",
        "Verify engines.node >= 18"
      ]
    },
    {
      "id": "9",
      "name": "SDK README",
      "file": "packages/sdk/README.md",
      "sections": [
        "Quick Start",
        "Installation",
        "Basic Usage",
        "Configuration Options",
        "Manual Tracing",
        "Observe API",
        "OpenAI Integration",
        "Anthropic Integration",
        "API Reference"
      ]
    }
  ],

  "executionOrder": [
    "1. Transport enhancements (gzip, retry logic)",
    "2. Batch processor improvements (queue limits)",
    "3. Config enhancements (new options)",
    "4. Write unit tests for transport",
    "5. Write unit tests for batch processor",
    "6. Complete remaining unit tests for >80% coverage",
    "7. Create npm publish workflow",
    "8. Update package metadata",
    "9. Write SDK README"
  ]
}
```

---

## Detailed Implementation

### 1. Transport Layer Enhancements

**File:** `packages/sdk/src/transport.ts`

```typescript
// Key changes:

import { gzipSync } from 'node:zlib';

// Add to sendTrace method:
private async sendTrace(trace: TraceData): Promise<IngestResponse> {
  const payload = this.formatPayload(trace);
  const jsonBody = JSON.stringify(payload);

  // Compress if enabled
  const body = this.config.compression
    ? gzipSync(Buffer.from(jsonBody))
    : jsonBody;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${this.config.apiKey}`,
  };

  if (this.config.compression) {
    headers['Content-Encoding'] = 'gzip';
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
    try {
      const response = await fetch(`${this.config.endpoint}/v1/traces`, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(this.config.timeout),
      });

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt) * 1000;
        await this.sleep(Math.min(delay, this.config.maxRetryDelay));
        continue;
      }

      // Don't retry on 4xx (except 429)
      if (response.status >= 400 && response.status < 500) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Retry on 5xx
      if (response.status >= 500) {
        throw new Error(`HTTP ${response.status}`);
      }

      return (await response.json()) as IngestResponse;
    } catch (err) {
      lastError = err as Error;

      // Exponential backoff for retryable errors
      if (attempt < this.config.maxRetries - 1) {
        await this.sleep(Math.min(Math.pow(2, attempt) * 100, this.config.maxRetryDelay));
      }
    }
  }

  throw lastError;
}
```

### 2. Batch Processor Improvements

**File:** `packages/sdk/src/transport.ts`

```typescript
// Add to enqueue method:
enqueue(trace: TraceData): void {
  if (this.config.disabled) return;

  // Queue overflow protection
  if (this.queue.length >= this.config.maxQueueSize) {
    const dropped = this.queue.shift(); // Drop oldest
    if (this.config.debug) {
      console.warn(
        `[Ducsigr] Queue full (${this.config.maxQueueSize}), dropped oldest trace: ${dropped?.id}`
      );
    }
  }

  this.queue.push(trace);
  // ... rest of method
}
```

### 3. Config Enhancements

**File:** `packages/sdk/src/types.ts`

```typescript
export interface DucsigrConfig {
  apiKey?: string;
  endpoint?: string;
  debug?: boolean;
  disabled?: boolean;

  // Batching
  flushInterval?: number;     // Default: 5000
  maxBatchSize?: number;      // Default: 10
  maxQueueSize?: number;      // Default: 10000  // NEW

  // Transport
  timeout?: number;           // Default: 30000   // NEW
  compression?: boolean;      // Default: true    // NEW
  maxRetries?: number;        // Default: 3
  maxRetryDelay?: number;     // Default: 30000   // NEW

  // Sampling
  sampleRate?: number;        // Default: 1.0     // NEW
}
```

### 4. npm Publish Workflow

**File:** `.github/workflows/publish-sdk.yml`

```yaml
name: Publish SDK

on:
  push:
    tags:
      - 'sdk-v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write  # For npm provenance

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'pnpm'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm --filter @ducsigr/sdk build

      - name: Test
        run: pnpm --filter @ducsigr/sdk test:run

      - name: Publish
        run: pnpm --filter @ducsigr/sdk publish --provenance --access public --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## Test Coverage Requirements

| File | Target Coverage | Test File |
|------|-----------------|-----------|
| `src/ducsigr.ts` | >80% | `tests/ducsigr.test.ts` |
| `src/trace.ts` | >80% | `tests/trace.test.ts` ✅ |
| `src/span.ts` | >80% | `tests/span.test.ts` |
| `src/transport.ts` | >80% | `tests/transport.test.ts` |
| `src/config.ts` | >80% | `tests/config.test.ts` |
| `src/context.ts` | >80% | `tests/context.test.ts` |
| `src/observe.ts` | >80% | `tests/observe.test.ts` ✅ |
| `src/utils/id.ts` | >80% | `tests/id.test.ts` |

---

## Success Criteria

- [ ] SDK installable via `npm install @ducsigr/sdk`
- [ ] gzip compression working (verify with wireshark/tcpdump)
- [ ] Retry logic handles 429 with Retry-After header
- [ ] Queue overflow protection prevents memory exhaustion
- [ ] All tests passing with >80% coverage
- [ ] npm publish workflow functional with provenance
- [ ] README provides clear getting-started guide

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| npm org `@ducsigr` not available | Check availability early, have backup name |
| Provenance requires OIDC | Ensure workflow has `id-token: write` permission |
| gzip adds latency | Make compression optional, measure impact |
| Breaking changes to existing users | None - SDK not yet published |

---

## Dependencies

- npm organization `@ducsigr` must be created
- `NPM_TOKEN` secret must be added to GitHub repository
- Ingest service endpoint must be production-ready
