# Evaluations & Scoring System - Engineering Specs

**EPIC:** LLM Evaluation & Quality Monitoring
**Package:** Core Platform

---

## Sprint Breakdown

| Sprint | Focus | Points |
|--------|-------|--------|
| 3 | Core Evaluations & Scoring | 8 |

**Total: 8 points**

---

## Overview

The Evaluations System enables users to score LLM outputs across multiple dimensions, track quality over time, and detect regressions. This is a critical feature for production AI applications.

### Industry Context

Based on research of industry-standard platforms:

| Feature | Langfuse | Braintrust | RAGAS | OpenAI Evals |
|---------|----------|------------|-------|--------------|
| Numeric Scores | ✅ | ✅ | ✅ | ✅ |
| Categorical Scores | ✅ | ❌ | ❌ | ✅ |
| Boolean Scores | ✅ | ❌ | ❌ | ❌ |
| Schema Configs | ✅ | ❌ | ❌ | ✅ |
| LLM-as-Judge | ✅ | ✅ | ✅ | ✅ |
| Human Annotation | ✅ | ✅ | ❌ | ❌ |
| RAG Metrics | via RAGAS | ✅ | ✅ | ❌ |

### Architecture Pattern

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Scoring Architecture                              │
└─────────────────────────────────────────────────────────────────────────┘

    Score Sources                    Score Targets
    ────────────                    ─────────────
    ┌──────────┐                    ┌──────────────┐
    │   SDK    │───────┐            │    Trace     │
    └──────────┘       │            └──────────────┘
    ┌──────────┐       │                   ▲
    │  Human   │───────┤                   │
    │Annotation│       │            ┌──────┴───────┐
    └──────────┘       │            │    Score     │
    ┌──────────┐       ▼            │   (linked)   │
    │LLM-as-   │──► Ingestion ──►   └──────┬───────┘
    │  Judge   │       ▲                   │
    └──────────┘       │            ┌──────┴───────┐
    ┌──────────┐       │            │     Span     │
    │ External │───────┘            │   Session    │
    │ Pipeline │                    │    User      │
    └──────────┘                    └──────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Score Types** | Numeric, Categorical, Boolean | Industry standard from Langfuse |
| **Schema Enforcement** | Optional ScoreConfigs | Flexibility with optional standardization |
| **Link Strategy** | Exactly one FK (trace/span/session/user) | Clean data model, no ambiguity |
| **Value Storage** | Separate columns per type | Type safety, efficient queries |
| **Sources** | SDK, Human, LLM-as-Judge, External | Cover all scoring workflows |

---

## Data Models

### Score

```prisma
model Score {
  id               String        @id
  projectId        String
  configId         String?       // Optional schema enforcement

  // Link to ONE of these
  traceId          String?
  spanId           String?
  sessionId        String?
  trackedUserId    String?

  name             String        // "relevance", "quality", etc.
  dataType         ScoreDataType // NUMERIC, CATEGORICAL, BOOLEAN

  numericValue     Float?
  categoricalValue String?
  booleanValue     Boolean?

  source           ScoreSource   // SDK, HUMAN, LLM_JUDGE, EXTERNAL
  authorId         String?       // For human scores
  comment          String?       // Reasoning/feedback
  metadata         Json?

  createdAt        DateTime
}
```

### ScoreConfig

```prisma
model ScoreConfig {
  id          String        @id
  projectId   String
  name        String        // "relevance" (unique per project)
  dataType    ScoreDataType
  description String?

  // For NUMERIC
  minValue    Float?
  maxValue    Float?

  // For CATEGORICAL
  categories  Json?         // ["good", "neutral", "bad"]

  isArchived  Boolean
}
```

---

## Pre-built Score Templates

Following industry best practices (RAGAS, Langfuse, OpenAI):

| Metric | Type | Range | Use Case |
|--------|------|-------|----------|
| `quality` | NUMERIC | 0-1 | Overall response quality |
| `relevance` | NUMERIC | 0-1 | Query-response relevance |
| `hallucination` | NUMERIC | 0-1 | Hallucination severity (0=none) |
| `faithfulness` | NUMERIC | 0-1 | RAGAS: Factual consistency |
| `context_relevancy` | NUMERIC | 0-1 | RAGAS: Context quality |
| `answer_relevancy` | NUMERIC | 0-1 | RAGAS: Answer quality |
| `toxicity` | NUMERIC | 0-1 | Toxicity level |
| `thumbs` | BOOLEAN | true/false | User feedback |
| `satisfaction` | CATEGORICAL | 5 levels | Satisfaction survey |

---

## Documents

| Document | Purpose |
|----------|---------|
| [104_SPRINT_3_EVALUATIONS_SPEC.md](./104_SPRINT_3_EVALUATIONS_SPEC.md) | Full engineering specification |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Score ingestion latency | < 50ms p95 |
| Aggregation query time | < 200ms for 30-day rollup |
| SDK overhead | < 1ms per score call |
| Config validation | 100% schema compliance |

---

## Research Sources

- [Langfuse Scores Data Model](https://langfuse.com/docs/scores/overview)
- [RAGAS Evaluation Metrics](https://docs.ragas.io/en/stable/concepts/metrics/)
- [Confident AI LLM Evaluation Guide](https://www.confident-ai.com/blog/llm-evaluation-metrics-everything-you-need-for-llm-evaluation)
- [OpenAI Evals Framework](https://github.com/openai/evals)
- [Braintrust Evaluation Features](https://www.braintrust.dev/articles/top-10-llm-observability-tools-2025)
